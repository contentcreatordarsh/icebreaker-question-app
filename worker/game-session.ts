/**
 * GameSession — Durable Object for Kahoot-style live question sessions.
 *
 * Uses the WebSocket Hibernation API so idle sessions don't burn CPU.
 * State machine: lobby → writing → revealing → ended
 *
 * Players connect via WebSocket (no Firebase auth required — guests welcome).
 * The host is identified by a `hostToken` generated at session creation.
 *
 * WebSocket attachments store the playerId so we can identify players
 * after DO hibernation (the in-memory sessions Map is rebuilt on wake).
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type SessionStatus = 'lobby' | 'writing' | 'revealing' | 'voting' | 'ended';

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  gender?: string;
  avatar?: string;
}

interface SessionState {
  roomCode: string;
  hostToken: string;
  hostName: string;
  status: SessionStatus;
  players: Record<string, Player>;        // playerId → Player
  currentQuestion: { text: string; index: number } | null;
  answers: Record<string, string>;        // playerId → answer text
  revealOrder: string[];                  // player IDs in reveal sequence
  revealIndex: number;                    // how many have been revealed so far
  timerEndsAt: string | null;             // ISO timestamp
  timerDurationSec: number;               // default 180 (3 minutes)
  questionCount: number;                  // total questions played
  createdAt: string;                      // ISO timestamp for auto-cleanup
  // Voting & Leaderboard
  votes: Record<string, string>;          // voterId → targetPlayerId
  scores: Record<string, number>;         // playerId → cumulative score
}

interface WsAttachment {
  playerId?: string;
  country?: string; // ISO 3166-1 alpha-2, captured from Cloudflare edge at upgrade
}

// ── Client → Server messages ───────────────────────────────────────────────────

type ClientMessage =
  | { type: 'join'; name: string; hostToken?: string; gender?: string; avatar?: string }
  | { type: 'start_question'; text: string; timerSec?: number }
  | { type: 'submit_answer'; answer: string }
  | { type: 'reveal_next' }
  | { type: 'reveal_all' }
  | { type: 'next_question' }
  | { type: 'end_session' }
  | { type: 'kick'; playerId: string }
  | { type: 'start_voting' }
  | { type: 'cast_vote'; targetPlayerId: string }
  | { type: 'end_voting' };

// ── Server → Client messages ───────────────────────────────────────────────────

type ServerMessage =
  | { type: 'welcome'; playerId: string; players: Array<{ id: string; name: string; isHost: boolean; gender?: string; avatar?: string }>; status: SessionStatus; roomCode: string; currentQuestion?: { text: string; index: number }; timerEndsAt?: string | null; answers?: Array<{ playerId: string; name: string; answer: string; avatar?: string }>; revealIndex?: number; leaderboard?: Array<{ playerId: string; name: string; score: number; avatar?: string }> }
  | { type: 'player_joined'; id: string; name: string; playerCount: number; gender?: string; avatar?: string }
  | { type: 'player_left'; id: string; playerCount: number }
  | { type: 'question_started'; text: string; index: number; timerEndsAt: string }
  | { type: 'answer_received'; playerId: string; playerCount: number; answeredCount: number }
  | { type: 'reveal'; playerId: string; name: string; answer: string; avatar?: string; revealIndex: number; totalAnswers: number }
  | { type: 'reveal_all'; answers: Array<{ playerId: string; name: string; answer: string; avatar?: string }> }
  | { type: 'phase_change'; status: SessionStatus }
  | { type: 'timer_expired' }
  | { type: 'error'; message: string }
  | { type: 'session_ended' }
  | { type: 'kicked' }
  | { type: 'voting_started' }
  | { type: 'vote_update'; votes: Record<string, number>; voterCount: number; totalVoters: number }
  | { type: 'vote_result'; winnerId: string; winnerName: string; leaderboard: Array<{ playerId: string; name: string; score: number; avatar?: string }> };

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_PLAYERS = 20;
const DEFAULT_TIMER_SEC = 180;  // 3 minutes
const MAX_TIMER_SEC = 600;      // 10 minutes
const MIN_TIMER_SEC = 30;
const AUTO_CLEANUP_MS = 2 * 60 * 60 * 1000;  // 2 hours
const MAX_ANSWER_LENGTH = 500;
const MAX_NAME_LENGTH = 30;
const MAX_QUESTION_LENGTH = 500;

/**
 * Defense-in-depth HTML escaping for user-supplied text.
 * The frontend uses React (which auto-escapes), but this protects against
 * any future use of innerHTML or non-React consumers.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Durable Object ─────────────────────────────────────────────────────────────

interface DOEnv {
  APP_KV?: { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void> };
}

export class GameSession implements DurableObject {
  private state: DurableObjectState;
  private env: DOEnv;
  private gameState: SessionState;
  /** Per-connection message timestamps for rate limiting (resets on DO hibernation). */
  private messageTimes: WeakMap<WebSocket, number[]> = new WeakMap();

  constructor(state: DurableObjectState, env: unknown) {
    this.env = env as DOEnv;
    this.state = state;
    this.gameState = {
      roomCode: '',
      hostToken: '',
      hostName: '',
      status: 'lobby',
      players: {},
      currentQuestion: null,
      answers: {},
      revealOrder: [],
      revealIndex: 0,
      timerEndsAt: null,
      timerDurationSec: DEFAULT_TIMER_SEC,
      questionCount: 0,
      createdAt: new Date().toISOString(),
      votes: {},
      scores: {},
    };

    // Restore state from hibernation storage
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<SessionState>('gameState');
      if (stored) {
        this.gameState = stored;
      }
    });
  }

  // ── WebSocket ↔ Player mapping ──────────────────────────────────────────────
  // Uses WebSocket attachments (survive hibernation) instead of an in-memory Map.
  // After hibernation wake, this.state.getWebSockets() returns live connections
  // and ws.deserializeAttachment() returns the stored playerId.

  /** Read the full attachment (playerId + country) for a WebSocket. */
  private getAttachment(ws: WebSocket): WsAttachment | null {
    try {
      return (ws as unknown as { deserializeAttachment(): WsAttachment | null }).deserializeAttachment();
    } catch {
      return null;
    }
  }

  /** Get the playerId for a WebSocket (from its attachment). */
  private getPlayerId(ws: WebSocket): string | null {
    return this.getAttachment(ws)?.playerId ?? null;
  }

  /** Store the country on a WebSocket at upgrade time (before a player joins). */
  private setCountry(ws: WebSocket, country: string): void {
    const att = this.getAttachment(ws) ?? {};
    (ws as unknown as { serializeAttachment(att: WsAttachment): void }).serializeAttachment({ ...att, country });
  }

  /** Store the playerId on a WebSocket (survives hibernation), preserving country. */
  private setPlayerId(ws: WebSocket, playerId: string): void {
    const att = this.getAttachment(ws) ?? {};
    (ws as unknown as { serializeAttachment(att: WsAttachment): void }).serializeAttachment({ ...att, playerId });
  }

  /** Get the WebSocket for a given playerId (searches all live connections). */
  private getWsForPlayer(playerId: string): WebSocket | null {
    for (const ws of this.state.getWebSockets()) {
      if (this.getPlayerId(ws) === playerId) return ws;
    }
    return null;
  }

  /** Get all live WebSockets with their player IDs. */
  private getAllPlayerSockets(): Array<{ playerId: string; ws: WebSocket }> {
    const result: Array<{ playerId: string; ws: WebSocket }> = [];
    for (const ws of this.state.getWebSockets()) {
      const id = this.getPlayerId(ws);
      if (id) result.push({ playerId: id, ws });
    }
    return result;
  }

  /** Initialize a new session — called once from the create endpoint. */
  async initialize(roomCode: string, hostToken: string): Promise<void> {
    this.gameState.roomCode = roomCode;
    this.gameState.hostToken = hostToken;
    this.gameState.createdAt = new Date().toISOString();
    await this.persist();

    // Schedule auto-cleanup alarm
    await this.state.storage.setAlarm(Date.now() + AUTO_CLEANUP_MS);
  }

  /** Handle incoming HTTP requests — initialization, status checks, and WebSocket upgrades. */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /initialize — called once by the create endpoint to set room code + host token
    if (url.pathname === '/initialize' && request.method === 'POST') {
      const body = await request.json() as { roomCode: string; hostToken: string };
      await this.initialize(body.roomCode, body.hostToken);
      return Response.json({ ok: true });
    }

    // GET /status — lightweight health check (used by lookup endpoint)
    if (url.pathname === '/status') {
      return Response.json({
        exists: true,
        status: this.gameState.status,
        playerCount: Object.keys(this.gameState.players).length,
        roomCode: this.gameState.roomCode,
      });
    }

    // WebSocket upgrade
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    if (this.gameState.status === 'ended') {
      return new Response('Session has ended', { status: 410 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Accept with hibernation API
    this.state.acceptWebSocket(server);

    // Stash the country (passed by the Worker from Cloudflare edge geo) on the
    // socket so handleJoin can count it per real player join.
    const country = (url.searchParams.get('c') || '').toUpperCase();
    if (/^[A-Z]{2}$/.test(country)) this.setCountry(server, country);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── WebSocket Hibernation Handlers ─────────────────────────────────────────

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    const text = typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage);

    // Reject oversized messages (DoS protection)
    if (text.length > 10_000) {
      this.send(ws, { type: 'error', message: 'Message too large' });
      return;
    }

    // Per-connection message rate limiting: max 20 messages per 5 seconds
    const now = Date.now();
    const times = this.messageTimes.get(ws) ?? [];
    const windowStart = now - 5000;
    const recentTimes = times.filter(t => t > windowStart);
    if (recentTimes.length >= 20) {
      this.send(ws, { type: 'error', message: 'Rate limited — slow down' });
      try { ws.close(1008, 'Rate limited'); } catch { /* already closed */ }
      return;
    }
    recentTimes.push(now);
    this.messageTimes.set(ws, recentTimes);

    let msg: ClientMessage;
    try {
      msg = JSON.parse(text) as ClientMessage;
    } catch {
      this.send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    // Get player ID from WebSocket attachment (survives hibernation)
    const playerId = this.getPlayerId(ws);

    switch (msg.type) {
      case 'join':
        await this.handleJoin(ws, msg);
        break;
      case 'start_question':
        if (playerId) await this.handleStartQuestion(playerId, msg);
        break;
      case 'submit_answer':
        if (playerId) await this.handleSubmitAnswer(playerId, msg);
        break;
      case 'reveal_next':
        if (playerId) await this.handleRevealNext(playerId);
        break;
      case 'reveal_all':
        if (playerId) await this.handleRevealAll(playerId);
        break;
      case 'next_question':
        if (playerId) await this.handleNextQuestion(playerId);
        break;
      case 'end_session':
        if (playerId) await this.handleEndSession(playerId);
        break;
      case 'kick':
        if (playerId) await this.handleKick(playerId, msg);
        break;
      case 'start_voting':
        if (playerId) await this.handleStartVoting(playerId);
        break;
      case 'cast_vote':
        if (playerId) await this.handleCastVote(playerId, msg);
        break;
      case 'end_voting':
        if (playerId) await this.handleEndVoting(playerId);
        break;
      default:
        this.send(ws, { type: 'error', message: 'Unknown message type' });
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async alarm(): Promise<void> {
    // Check if this is a timer expiration or auto-cleanup
    if (this.gameState.status === 'writing' && this.gameState.timerEndsAt) {
      const now = Date.now();
      const timerEnd = new Date(this.gameState.timerEndsAt).getTime();
      if (now >= timerEnd) {
        // Timer expired — notify all players and move to revealing
        this.broadcast({ type: 'timer_expired' });
        this.gameState.status = 'revealing';
        this.gameState.timerEndsAt = null;

        // Build reveal order — shuffle for surprise
        this.gameState.revealOrder = this.shuffleArray(Object.keys(this.gameState.answers));
        this.gameState.revealIndex = 0;

        this.broadcast({ type: 'phase_change', status: 'revealing' });
        await this.persist();

        // Re-schedule the auto-cleanup alarm
        await this.state.storage.setAlarm(Date.now() + AUTO_CLEANUP_MS);
        return;
      }
    }

    // Auto-cleanup: end the session if it's been idle too long
    if (this.gameState.status !== 'ended') {
      const elapsed = Date.now() - new Date(this.gameState.createdAt).getTime();
      if (elapsed > AUTO_CLEANUP_MS) {
        this.broadcast({ type: 'session_ended' });
        this.gameState.status = 'ended';
        await this.persist();
        // Close all WebSockets
        for (const ws of this.state.getWebSockets()) {
          try { ws.close(1000, 'Session expired'); } catch { /* already closed */ }
        }
      }
    }
  }

  // ── Message Handlers ───────────────────────────────────────────────────────

  private async handleJoin(ws: WebSocket, msg: { type: 'join'; name: string; hostToken?: string; gender?: string; avatar?: string }): Promise<void> {
    const name = escapeHtml((msg.name || '').trim().slice(0, MAX_NAME_LENGTH));
    if (!name) {
      this.send(ws, { type: 'error', message: 'Name is required' });
      return;
    }

    if (this.gameState.status === 'ended') {
      this.send(ws, { type: 'error', message: 'Session has ended' });
      return;
    }

    const isHost = msg.hostToken === this.gameState.hostToken && !!msg.hostToken;
    const gender = msg.gender || undefined;
    // Validate avatar is a short emoji string, not arbitrary content
    const rawAvatar = (msg.avatar || '').slice(0, 10);
    const avatar = rawAvatar || undefined;

    // Check if host is reconnecting
    if (isHost) {
      const existingHostId = Object.keys(this.gameState.players).find(
        id => this.gameState.players[id].isHost
      );

      if (existingHostId) {
        // Reconnect — close old WebSocket and attach the new one
        const oldWs = this.getWsForPlayer(existingHostId);
        if (oldWs) {
          try { oldWs.close(1000, 'Reconnected from another tab'); } catch { /* ok */ }
        }
        this.setPlayerId(ws, existingHostId);
        this.gameState.players[existingHostId].name = name;

        // Send welcome with full current state
        this.sendWelcome(ws, existingHostId);
        await this.persist();
        return;
      }
    }

    // Check player limit (non-host)
    if (!isHost && Object.keys(this.gameState.players).length >= MAX_PLAYERS) {
      this.send(ws, { type: 'error', message: `Session is full (max ${MAX_PLAYERS} players)` });
      return;
    }

    // Create new player
    const playerId = crypto.randomUUID();
    const player: Player = { id: playerId, name, isHost, gender, avatar };
    this.gameState.players[playerId] = player;

    // Store playerId on the WebSocket (survives DO hibernation)
    this.setPlayerId(ws, playerId);

    if (isHost) {
      this.gameState.hostName = name;
    }

    // Send welcome to the joining player
    this.sendWelcome(ws, playerId);

    // Broadcast to others
    this.broadcastExcept(playerId, {
      type: 'player_joined',
      id: playerId,
      name,
      playerCount: Object.keys(this.gameState.players).length,
      gender,
      avatar,
    });

    // Increment player stat (non-blocking)
    if (!isHost) {
      this.incrementStat('stats:players_total');
      this.incrementStat(`daily:players:${new Date().toISOString().slice(0, 10)}`);
      // Count where this player joined from (Cloudflare edge geo, stashed at upgrade).
      const country = this.getAttachment(ws)?.country;
      if (country && /^[A-Z]{2}$/.test(country)) {
        this.incrementStat(`stats:country:${country}`);
      }
    }

    await this.persist();
  }

  private async handleStartQuestion(playerId: string, msg: { type: 'start_question'; text: string; timerSec?: number }): Promise<void> {
    if (!this.isHost(playerId)) {
      this.sendError(playerId, 'Only the host can start a question');
      return;
    }

    if (this.gameState.status !== 'lobby' && this.gameState.status !== 'revealing' && this.gameState.status !== 'voting') {
      this.sendError(playerId, 'Cannot start a new question in current phase');
      return;
    }

    const text = escapeHtml((msg.text || '').trim().slice(0, MAX_QUESTION_LENGTH));
    if (!text) {
      this.sendError(playerId, 'Question text is required');
      return;
    }

    const timerSec = Math.min(MAX_TIMER_SEC, Math.max(MIN_TIMER_SEC, msg.timerSec ?? DEFAULT_TIMER_SEC));
    const timerEndsAt = new Date(Date.now() + timerSec * 1000).toISOString();

    this.gameState.questionCount += 1;
    this.gameState.currentQuestion = { text, index: this.gameState.questionCount };
    this.gameState.answers = {};
    this.gameState.revealOrder = [];
    this.gameState.revealIndex = 0;
    this.gameState.status = 'writing';
    this.gameState.timerEndsAt = timerEndsAt;
    this.gameState.timerDurationSec = timerSec;
    this.gameState.votes = {};

    this.broadcast({
      type: 'question_started',
      text,
      index: this.gameState.questionCount,
      timerEndsAt,
    });

    // Increment question stat (non-blocking)
    this.incrementStat('stats:questions_total');
    this.incrementStat(`daily:questions:${new Date().toISOString().slice(0, 10)}`);

    // Set alarm for timer expiration
    await this.state.storage.setAlarm(new Date(timerEndsAt).getTime());
    await this.persist();
  }

  private async handleSubmitAnswer(playerId: string, msg: { type: 'submit_answer'; answer: string }): Promise<void> {
    if (this.gameState.status !== 'writing') {
      this.sendError(playerId, 'Not in writing phase');
      return;
    }

    if (!this.gameState.players[playerId]) {
      this.sendError(playerId, 'You are not in this session');
      return;
    }

    // Reject duplicate submissions — players can only answer once per question
    if (this.gameState.answers[playerId]) {
      this.sendError(playerId, 'You already submitted an answer');
      return;
    }

    const answer = escapeHtml((msg.answer || '').trim().slice(0, MAX_ANSWER_LENGTH));
    if (!answer) {
      this.sendError(playerId, 'Answer cannot be empty');
      return;
    }

    this.gameState.answers[playerId] = answer;

    // Notify everyone about the submission (without revealing the answer)
    const answeredCount = Object.keys(this.gameState.answers).length;
    const playerCount = Object.keys(this.gameState.players).length;

    this.broadcast({
      type: 'answer_received',
      playerId,
      playerCount,
      answeredCount,
    });

    // If everyone has answered, auto-transition to revealing
    if (answeredCount >= playerCount) {
      this.gameState.status = 'revealing';
      this.gameState.timerEndsAt = null;
      this.gameState.revealOrder = this.shuffleArray(Object.keys(this.gameState.answers));
      this.gameState.revealIndex = 0;
      this.broadcast({ type: 'phase_change', status: 'revealing' });
    }

    await this.persist();
  }

  private async handleRevealNext(playerId: string): Promise<void> {
    if (!this.isHost(playerId)) {
      this.sendError(playerId, 'Only the host can reveal answers');
      return;
    }

    // Allow host to force transition from writing → revealing (skip timer)
    if (this.gameState.status === 'writing') {
      this.gameState.status = 'revealing';
      this.gameState.timerEndsAt = null;
      this.gameState.revealOrder = this.shuffleArray(Object.keys(this.gameState.answers));
      this.gameState.revealIndex = 0;
      this.broadcast({ type: 'timer_expired' });
      this.broadcast({ type: 'phase_change', status: 'revealing' });
    }

    if (this.gameState.status !== 'revealing') {
      this.sendError(playerId, 'Not in revealing phase');
      return;
    }

    if (this.gameState.revealIndex >= this.gameState.revealOrder.length) {
      this.sendError(playerId, 'All answers have been revealed');
      return;
    }

    const revealPlayerId = this.gameState.revealOrder[this.gameState.revealIndex];
    const player = this.gameState.players[revealPlayerId];
    const answer = this.gameState.answers[revealPlayerId];

    this.gameState.revealIndex += 1;

    this.broadcast({
      type: 'reveal',
      playerId: revealPlayerId,
      name: player?.name ?? 'Unknown',
      answer: answer ?? '',
      avatar: player?.avatar,
      revealIndex: this.gameState.revealIndex,
      totalAnswers: this.gameState.revealOrder.length,
    });

    await this.persist();
  }

  private async handleRevealAll(playerId: string): Promise<void> {
    if (!this.isHost(playerId)) {
      this.sendError(playerId, 'Only the host can reveal answers');
      return;
    }

    // Allow host to force transition from writing → revealing (skip timer)
    if (this.gameState.status === 'writing') {
      this.gameState.status = 'revealing';
      this.gameState.timerEndsAt = null;
      this.gameState.revealOrder = this.shuffleArray(Object.keys(this.gameState.answers));
      this.gameState.revealIndex = 0;
      this.broadcast({ type: 'timer_expired' });
      this.broadcast({ type: 'phase_change', status: 'revealing' });
    }

    if (this.gameState.status !== 'revealing') {
      this.sendError(playerId, 'Not in revealing phase');
      return;
    }

    // Reveal all answers
    const allAnswers = this.gameState.revealOrder.map(pid => ({
      playerId: pid,
      name: this.gameState.players[pid]?.name ?? 'Unknown',
      answer: this.gameState.answers[pid] ?? '',
      avatar: this.gameState.players[pid]?.avatar,
    }));

    this.gameState.revealIndex = this.gameState.revealOrder.length;

    this.broadcast({ type: 'reveal_all', answers: allAnswers });
    await this.persist();
  }

  private async handleNextQuestion(playerId: string): Promise<void> {
    if (!this.isHost(playerId)) {
      this.sendError(playerId, 'Only the host can advance questions');
      return;
    }

    // Reset to lobby so host can pick next question
    this.gameState.status = 'lobby';
    this.gameState.currentQuestion = null;
    this.gameState.answers = {};
    this.gameState.revealOrder = [];
    this.gameState.revealIndex = 0;
    this.gameState.timerEndsAt = null;
    this.gameState.votes = {};
    // Note: scores are NOT reset — they accumulate across the session

    this.broadcast({ type: 'phase_change', status: 'lobby' });
    await this.persist();
  }

  private async handleEndSession(playerId: string): Promise<void> {
    if (!this.isHost(playerId)) {
      this.sendError(playerId, 'Only the host can end the session');
      return;
    }

    this.gameState.status = 'ended';
    this.broadcast({ type: 'session_ended' });
    await this.persist();

    // Store session summary in KV for history endpoint
    if (this.env.APP_KV) {
      const playerCount = Object.keys(this.gameState.players).length;
      const summary = JSON.stringify({
        playerCount,
        questionsPlayed: this.gameState.questionCount,
        endedAt: new Date().toISOString(),
      });
      this.env.APP_KV.put(`session-summary:${this.gameState.roomCode}`, summary).catch(() => {});
    }

    // Close all WebSockets
    for (const ws of this.state.getWebSockets()) {
      try { ws.close(1000, 'Session ended by host'); } catch { /* already closed */ }
    }
  }

  private async handleKick(playerId: string, msg: { type: 'kick'; playerId: string }): Promise<void> {
    if (!this.isHost(playerId)) {
      this.sendError(playerId, 'Only the host can kick players');
      return;
    }

    const targetId = msg.playerId;
    const target = this.gameState.players[targetId];
    if (!target) {
      this.sendError(playerId, 'Player not found');
      return;
    }
    if (target.isHost) {
      this.sendError(playerId, 'Cannot kick the host');
      return;
    }

    // Notify the kicked player
    const kickedWs = this.getWsForPlayer(targetId);
    if (kickedWs) {
      this.send(kickedWs, { type: 'kicked' });
      try { kickedWs.close(1000, 'Kicked by host'); } catch { /* ok */ }
    }

    // Remove from state
    delete this.gameState.players[targetId];
    delete this.gameState.answers[targetId];

    // Clean up votes: remove votes BY the kicked player and votes FOR them
    delete this.gameState.votes[targetId];
    for (const [voterId, voteTarget] of Object.entries(this.gameState.votes)) {
      if (voteTarget === targetId) delete this.gameState.votes[voterId];
    }

    // Notify remaining players
    this.broadcast({
      type: 'player_left',
      id: targetId,
      playerCount: Object.keys(this.gameState.players).length,
    });

    await this.persist();
  }

  // ── Voting Handlers ──────────────────────────────────────────────────────────

  private async handleStartVoting(playerId: string): Promise<void> {
    if (!this.isHost(playerId)) {
      this.sendError(playerId, 'Only the host can start voting');
      return;
    }

    if (this.gameState.status !== 'revealing') {
      this.sendError(playerId, 'Can only start voting after revealing');
      return;
    }

    this.gameState.status = 'voting';
    this.gameState.votes = {};

    this.broadcast({ type: 'voting_started' });
    await this.persist();
  }

  private async handleCastVote(playerId: string, msg: { type: 'cast_vote'; targetPlayerId: string }): Promise<void> {
    if (this.gameState.status !== 'voting') {
      this.sendError(playerId, 'Voting is not open');
      return;
    }

    if (this.gameState.votes[playerId]) {
      this.sendError(playerId, 'You already voted');
      return;
    }

    if (msg.targetPlayerId === playerId) {
      this.sendError(playerId, 'Cannot vote for yourself');
      return;
    }

    // Validate target is a real player with an answer
    if (!this.gameState.players[msg.targetPlayerId] || !this.gameState.answers[msg.targetPlayerId]) {
      this.sendError(playerId, 'Invalid vote target');
      return;
    }

    this.gameState.votes[playerId] = msg.targetPlayerId;

    // Tally current votes
    const voteCounts: Record<string, number> = {};
    for (const targetId of Object.values(this.gameState.votes)) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }

    const totalVoters = Object.keys(this.gameState.players).length;
    const voterCount = Object.keys(this.gameState.votes).length;

    this.broadcast({
      type: 'vote_update',
      votes: voteCounts,
      voterCount,
      totalVoters,
    });

    await this.persist();
  }

  private async handleEndVoting(playerId: string): Promise<void> {
    if (!this.isHost(playerId)) {
      this.sendError(playerId, 'Only the host can end voting');
      return;
    }

    if (this.gameState.status !== 'voting') {
      this.sendError(playerId, 'Voting is not active');
      return;
    }

    // Tally final votes
    const voteCounts: Record<string, number> = {};
    for (const targetId of Object.values(this.gameState.votes)) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }

    // Find the winner(s) — highest vote count
    let maxVotes = 0;
    for (const count of Object.values(voteCounts)) {
      if (count > maxVotes) maxVotes = count;
    }

    // Award points: 1 per vote, +2 bonus for highest
    for (const [targetId, count] of Object.entries(voteCounts)) {
      const bonus = (count === maxVotes && maxVotes > 0) ? 2 : 0;
      this.gameState.scores[targetId] = (this.gameState.scores[targetId] || 0) + count + bonus;
    }

    // Find winner for the announcement
    const winnerId = Object.entries(voteCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? '';
    const winnerName = this.gameState.players[winnerId]?.name ?? 'Unknown';

    // Build leaderboard
    const leaderboard = Object.entries(this.gameState.scores)
      .filter(([pid]) => this.gameState.players[pid])
      .map(([pid, score]) => ({
        playerId: pid,
        name: this.gameState.players[pid].name,
        score,
        avatar: this.gameState.players[pid].avatar,
      }))
      .sort((a, b) => b.score - a.score);

    // Transition back to revealing (host can then next-question or end)
    this.gameState.status = 'revealing';

    this.broadcast({
      type: 'vote_result',
      winnerId,
      winnerName,
      leaderboard,
    });

    await this.persist();
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const disconnectedId = this.getPlayerId(ws);
    if (!disconnectedId) return;

    const player = this.gameState.players[disconnectedId];
    if (!player) return;

    if (!player.isHost) {
      // Non-host: remove from the game
      delete this.gameState.players[disconnectedId];
      delete this.gameState.answers[disconnectedId];

      this.broadcast({
        type: 'player_left',
        id: disconnectedId,
        playerCount: Object.keys(this.gameState.players).length,
      });

      await this.persist();
    }
    // Host stays in players list for reconnection
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private isHost(playerId: string): boolean {
    return this.gameState.players[playerId]?.isHost === true;
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // WebSocket already closed — ignore
    }
  }

  private sendError(playerId: string, message: string): void {
    const ws = this.getWsForPlayer(playerId);
    if (ws) this.send(ws, { type: 'error', message });
  }

  private broadcast(msg: ServerMessage): void {
    for (const ws of this.state.getWebSockets()) {
      this.send(ws, msg);
    }
  }

  private broadcastExcept(excludeId: string, msg: ServerMessage): void {
    for (const ws of this.state.getWebSockets()) {
      const id = this.getPlayerId(ws);
      if (id !== excludeId) this.send(ws, msg);
    }
  }

  private sendWelcome(ws: WebSocket, playerId: string): void {
    const players = Object.values(this.gameState.players).map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      gender: p.gender,
      avatar: p.avatar,
    }));

    const welcome: ServerMessage = {
      type: 'welcome',
      playerId,
      players,
      status: this.gameState.status,
      roomCode: this.gameState.roomCode,
    };

    // Include current question state if in writing or revealing
    if (this.gameState.currentQuestion) {
      welcome.currentQuestion = this.gameState.currentQuestion;
      welcome.timerEndsAt = this.gameState.timerEndsAt;
    }

    // If revealing, include already-revealed answers
    if (this.gameState.status === 'revealing' || this.gameState.status === 'voting') {
      const revealed = this.gameState.revealOrder
        .slice(0, this.gameState.revealIndex)
        .map(pid => ({
          playerId: pid,
          name: this.gameState.players[pid]?.name ?? 'Unknown',
          answer: this.gameState.answers[pid] ?? '',
          avatar: this.gameState.players[pid]?.avatar,
        }));
      welcome.answers = revealed;
      welcome.revealIndex = this.gameState.revealIndex;
    }

    // Include leaderboard if scores exist
    if (Object.keys(this.gameState.scores).length > 0) {
      welcome.leaderboard = Object.entries(this.gameState.scores)
        .filter(([pid]) => this.gameState.players[pid])
        .map(([pid, score]) => ({
          playerId: pid,
          name: this.gameState.players[pid].name,
          score,
          avatar: this.gameState.players[pid].avatar,
        }))
        .sort((a, b) => b.score - a.score);
    }

    this.send(ws, welcome);
  }

  /** Increment a KV stat counter (fire-and-forget). */
  private incrementStat(key: string): void {
    if (!this.env.APP_KV) return;
    this.env.APP_KV.get(key).then(val => {
      const current = parseInt(val ?? '0', 10);
      this.env.APP_KV!.put(key, String(current + 1));
    }).catch(() => { /* non-critical */ });
  }

  private async persist(): Promise<void> {
    await this.state.storage.put('gameState', this.gameState);
  }

  /** Fisher-Yates shuffle — returns a new array. */
  private shuffleArray(arr: string[]): string[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
