import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

export interface StoredNote {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  event_start: string | null;
  event_end: string | null;
  event_guid: string | null;
  call_url: string | null;
  content_markdown: string | null;
  synced_at: string;
}

export interface StoredRecording {
  id: string;
  note_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  event_start: string | null;
  event_end: string | null;
  recording_start: string | null;
  recording_end: string | null;
  event_guid: string | null;
  call_url: string | null;
  transcript_json: string | null;
  synced_at: string;
}

export interface StoredActionItem {
  id: number;
  note_id: string;
  content: string;
  assignee: string | null;
  due_date: string | null;
  is_completed: boolean;
  created_at: string;
}

export interface StoredParticipant {
  id: number;
  note_id: string;
  email: string;
}

export class FellowDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const defaultPath = path.join(os.homedir(), ".fellow-mcp", "fellow.db");
    const finalPath = dbPath ?? defaultPath;
    
    // Ensure directory exists
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(finalPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        event_start TEXT,
        event_end TEXT,
        event_guid TEXT,
        call_url TEXT,
        content_markdown TEXT,
        synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recordings (
        id TEXT PRIMARY KEY,
        note_id TEXT,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        event_start TEXT,
        event_end TEXT,
        recording_start TEXT,
        recording_end TEXT,
        event_guid TEXT,
        call_url TEXT,
        transcript_json TEXT,
        synced_at TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes(id)
      );

      CREATE TABLE IF NOT EXISTS action_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id TEXT NOT NULL,
        content TEXT NOT NULL,
        assignee TEXT,
        due_date TEXT,
        is_completed INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes(id)
      );

      CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id TEXT NOT NULL,
        email TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes(id),
        UNIQUE(note_id, email)
      );

      CREATE TABLE IF NOT EXISTS sync_status (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_notes_event_start ON notes(event_start);
      CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
      CREATE INDEX IF NOT EXISTS idx_recordings_note_id ON recordings(note_id);
      CREATE INDEX IF NOT EXISTS idx_action_items_note_id ON action_items(note_id);
      CREATE INDEX IF NOT EXISTS idx_action_items_assignee ON action_items(assignee);
      CREATE INDEX IF NOT EXISTS idx_participants_note_id ON participants(note_id);
      CREATE INDEX IF NOT EXISTS idx_participants_email ON participants(email);
    `);
  }

  // Notes
  upsertNote(note: Omit<StoredNote, "synced_at">): void {
    const stmt = this.db.prepare(`
      INSERT INTO notes (id, title, created_at, updated_at, event_start, event_end, event_guid, call_url, content_markdown, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at,
        event_start = excluded.event_start,
        event_end = excluded.event_end,
        event_guid = excluded.event_guid,
        call_url = excluded.call_url,
        content_markdown = COALESCE(excluded.content_markdown, content_markdown),
        synced_at = excluded.synced_at
    `);
    stmt.run(
      note.id,
      note.title,
      note.created_at,
      note.updated_at,
      note.event_start,
      note.event_end,
      note.event_guid,
      note.call_url,
      note.content_markdown,
      new Date().toISOString()
    );
  }

  getNote(id: string): StoredNote | null {
    const stmt = this.db.prepare("SELECT * FROM notes WHERE id = ?");
    return stmt.get(id) as StoredNote | null;
  }

  getAllNotes(): StoredNote[] {
    const stmt = this.db.prepare("SELECT * FROM notes ORDER BY event_start DESC");
    return stmt.all() as StoredNote[];
  }

  searchNotes(query: string): StoredNote[] {
    const stmt = this.db.prepare(`
      SELECT * FROM notes 
      WHERE title LIKE ? OR content_markdown LIKE ?
      ORDER BY event_start DESC
    `);
    const pattern = `%${query}%`;
    return stmt.all(pattern, pattern) as StoredNote[];
  }

  // Recordings
  upsertRecording(recording: Omit<StoredRecording, "synced_at">): void {
    const stmt = this.db.prepare(`
      INSERT INTO recordings (id, note_id, title, created_at, updated_at, event_start, event_end, recording_start, recording_end, event_guid, call_url, transcript_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        note_id = excluded.note_id,
        title = excluded.title,
        updated_at = excluded.updated_at,
        event_start = excluded.event_start,
        event_end = excluded.event_end,
        recording_start = excluded.recording_start,
        recording_end = excluded.recording_end,
        event_guid = excluded.event_guid,
        call_url = excluded.call_url,
        transcript_json = COALESCE(excluded.transcript_json, transcript_json),
        synced_at = excluded.synced_at
    `);
    stmt.run(
      recording.id,
      recording.note_id,
      recording.title,
      recording.created_at,
      recording.updated_at,
      recording.event_start,
      recording.event_end,
      recording.recording_start,
      recording.recording_end,
      recording.event_guid,
      recording.call_url,
      recording.transcript_json,
      new Date().toISOString()
    );
  }

  getRecording(id: string): StoredRecording | null {
    const stmt = this.db.prepare("SELECT * FROM recordings WHERE id = ?");
    return stmt.get(id) as StoredRecording | null;
  }

  // Action Items
  clearActionItemsForNote(noteId: string): void {
    const stmt = this.db.prepare("DELETE FROM action_items WHERE note_id = ?");
    stmt.run(noteId);
  }

  insertActionItem(item: Omit<StoredActionItem, "id">): void {
    const stmt = this.db.prepare(`
      INSERT INTO action_items (note_id, content, assignee, due_date, is_completed, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      item.note_id,
      item.content,
      item.assignee,
      item.due_date,
      item.is_completed ? 1 : 0,
      item.created_at
    );
  }

  getAllActionItems(filters?: {
    assignee?: string;
    is_completed?: boolean;
    since?: string;
  }): (StoredActionItem & { note_title: string; event_start: string | null })[] {
    let query = `
      SELECT a.*, n.title as note_title, n.event_start
      FROM action_items a
      JOIN notes n ON a.note_id = n.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filters?.assignee) {
      query += " AND a.assignee LIKE ?";
      params.push(`%${filters.assignee}%`);
    }
    if (filters?.is_completed !== undefined) {
      query += " AND a.is_completed = ?";
      params.push(filters.is_completed ? 1 : 0);
    }
    if (filters?.since) {
      query += " AND n.event_start >= ?";
      params.push(filters.since);
    }

    query += " ORDER BY n.event_start DESC";

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as (StoredActionItem & { note_title: string; event_start: string | null })[];
  }

  // Participants
  clearParticipantsForNote(noteId: string): void {
    const stmt = this.db.prepare("DELETE FROM participants WHERE note_id = ?");
    stmt.run(noteId);
  }

  insertParticipant(noteId: string, email: string): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO participants (note_id, email) VALUES (?, ?)
    `);
    stmt.run(noteId, email);
  }

  getMeetingsByParticipants(emails: string[]): StoredNote[] {
    if (emails.length === 0) return [];

    const placeholders = emails.map(() => "?").join(",");
    const stmt = this.db.prepare(`
      SELECT DISTINCT n.* FROM notes n
      JOIN participants p ON n.id = p.note_id
      WHERE p.email IN (${placeholders})
      ORDER BY n.event_start DESC
    `);
    return stmt.all(...emails) as StoredNote[];
  }

  getMeetingsWithAllParticipants(emails: string[]): StoredNote[] {
    if (emails.length === 0) return [];

    const placeholders = emails.map(() => "?").join(",");
    const stmt = this.db.prepare(`
      SELECT n.* FROM notes n
      WHERE (
        SELECT COUNT(DISTINCT p.email) FROM participants p 
        WHERE p.note_id = n.id AND p.email IN (${placeholders})
      ) = ?
      ORDER BY n.event_start DESC
    `);
    return stmt.all(...emails, emails.length) as StoredNote[];
  }

  getParticipantsForNote(noteId: string): string[] {
    const stmt = this.db.prepare("SELECT email FROM participants WHERE note_id = ?");
    const rows = stmt.all(noteId) as { email: string }[];
    return rows.map((r) => r.email);
  }

  // Sync status
  getLastSyncTime(): string | null {
    const stmt = this.db.prepare("SELECT value FROM sync_status WHERE key = 'last_sync'");
    const row = stmt.get() as { value: string } | undefined;
    return row?.value ?? null;
  }

  setLastSyncTime(time: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO sync_status (key, value) VALUES ('last_sync', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(time);
  }

  // Stats
  getStats(): { notes: number; recordings: number; action_items: number; participants: number } {
    const notes = (this.db.prepare("SELECT COUNT(*) as count FROM notes").get() as { count: number }).count;
    const recordings = (this.db.prepare("SELECT COUNT(*) as count FROM recordings").get() as { count: number }).count;
    const action_items = (this.db.prepare("SELECT COUNT(*) as count FROM action_items").get() as { count: number }).count;
    const participants = (this.db.prepare("SELECT COUNT(DISTINCT email) as count FROM participants").get() as { count: number }).count;
    return { notes, recordings, action_items, participants };
  }

  close(): void {
    this.db.close();
  }
}
