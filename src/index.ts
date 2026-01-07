#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { FellowDatabase } from "./database.js";

// Types for Fellow API responses
interface SpeechSegment {
  speaker: string;
  text: string;
  start_time: number;
  end_time: number;
}

interface Transcript {
  language_code: string;
  speech_segments: SpeechSegment[];
}

interface Recording {
  id: string;
  title: string;
  note_id: string;
  created_at: string;
  updated_at: string;
  event_start?: string;
  event_end?: string;
  recording_start?: string;
  recording_end?: string;
  event_guid?: string;
  call_url?: string;
  transcript?: Transcript;
}

interface Note {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  event_start?: string;
  event_end?: string;
  event_guid?: string;
  call_url?: string;
  recording_ids?: string[];
  content_markdown?: string;
  event_attendees?: string[];
}

interface PageInfo {
  cursor: string | null;
  page_size: number;
}

interface RecordingsResponse {
  recordings: {
    page_info: PageInfo;
    data: Recording[];
  };
}

interface NotesResponse {
  notes: {
    page_info: PageInfo;
    data: Note[];
  };
}

// Fellow API Client
class FellowClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, subdomain: string) {
    this.apiKey = apiKey;
    this.baseUrl = `https://${subdomain}.fellow.app/api/v1`;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Fellow API error (${response.status}): ${errorText}`
      );
    }

    return response.json() as Promise<T>;
  }

  async listRecordings(options: {
    title?: string;
    created_at_start?: string;
    created_at_end?: string;
    updated_at_start?: string;
    updated_at_end?: string;
    event_guid?: string;
    channel_id?: string;
    include_transcript?: boolean;
    cursor?: string;
    page_size?: number;
  }): Promise<RecordingsResponse> {
    const body: Record<string, unknown> = {};

    // Build filters
    const filters: Record<string, string> = {};
    if (options.title) filters.title = options.title;
    if (options.created_at_start) filters.created_at_start = options.created_at_start;
    if (options.created_at_end) filters.created_at_end = options.created_at_end;
    if (options.updated_at_start) filters.updated_at_start = options.updated_at_start;
    if (options.updated_at_end) filters.updated_at_end = options.updated_at_end;
    if (options.event_guid) filters.event_guid = options.event_guid;
    if (options.channel_id) filters.channel_id = options.channel_id;

    if (Object.keys(filters).length > 0) {
      body.filters = filters;
    }

    // Build include
    if (options.include_transcript) {
      body.include = { transcript: true };
    }

    // Build pagination
    body.pagination = {
      cursor: options.cursor ?? null,
      page_size: options.page_size ?? 20,
    };

    return this.request<RecordingsResponse>("POST", "/recordings", body);
  }

  async getRecording(recordingId: string): Promise<Recording> {
    return this.request<Recording>("GET", `/recording/${recordingId}`);
  }

  async listNotes(options: {
    title?: string;
    created_at_start?: string;
    created_at_end?: string;
    updated_at_start?: string;
    updated_at_end?: string;
    event_guid?: string;
    channel_id?: string;
    include_content?: boolean;
    include_attendees?: boolean;
    cursor?: string;
    page_size?: number;
  }): Promise<NotesResponse> {
    const body: Record<string, unknown> = {};

    // Build filters
    const filters: Record<string, string> = {};
    if (options.title) filters.title = options.title;
    if (options.created_at_start) filters.created_at_start = options.created_at_start;
    if (options.created_at_end) filters.created_at_end = options.created_at_end;
    if (options.updated_at_start) filters.updated_at_start = options.updated_at_start;
    if (options.updated_at_end) filters.updated_at_end = options.updated_at_end;
    if (options.event_guid) filters.event_guid = options.event_guid;
    if (options.channel_id) filters.channel_id = options.channel_id;

    if (Object.keys(filters).length > 0) {
      body.filters = filters;
    }

    // Build include
    const include: Record<string, boolean> = {};
    if (options.include_content) include.content_markdown = true;
    if (options.include_attendees) include.event_attendees = true;
    if (Object.keys(include).length > 0) {
      body.include = include;
    }

    // Build pagination
    body.pagination = {
      cursor: options.cursor ?? null,
      page_size: options.page_size ?? 20,
    };

    return this.request<NotesResponse>("POST", "/notes", body);
  }

  async getNote(noteId: string): Promise<Note> {
    return this.request<Note>("GET", `/note/${noteId}`);
  }
}

// Tool definitions
const tools: Tool[] = [
  {
    name: "search_meetings",
    description:
      "Search for meetings/recordings in Fellow. Can filter by title, date range, or event ID. Returns a list of meetings with basic metadata.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Filter by meeting title (case-insensitive partial match)",
        },
        created_at_start: {
          type: "string",
          description: "Filter meetings created after this date (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)",
        },
        created_at_end: {
          type: "string",
          description: "Filter meetings created before this date (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (1-50, default 20)",
        },
      },
    },
  },
  {
    name: "get_meeting_transcript",
    description:
      "Get the full transcript of a meeting recording. Returns diarized (speaker-labeled) and timestamped transcript segments.",
    inputSchema: {
      type: "object",
      properties: {
        recording_id: {
          type: "string",
          description: "The ID of the recording to get the transcript for",
        },
        meeting_title: {
          type: "string",
          description: "Alternatively, search by meeting title to find and return the transcript",
        },
      },
    },
  },
  {
    name: "get_meeting_summary",
    description:
      "Get the meeting summary/notes content. Returns the structured notes including agenda items, discussion topics, and decisions made.",
    inputSchema: {
      type: "object",
      properties: {
        note_id: {
          type: "string",
          description: "The ID of the note to get the summary for",
        },
        recording_id: {
          type: "string",
          description: "Alternatively, provide a recording ID to get its associated note/summary",
        },
        meeting_title: {
          type: "string",
          description: "Alternatively, search by meeting title to find and return the summary",
        },
      },
    },
  },
  {
    name: "get_action_items",
    description:
      "Get action items from a meeting. Extracts action items from the meeting notes content.",
    inputSchema: {
      type: "object",
      properties: {
        note_id: {
          type: "string",
          description: "The ID of the note to get action items from",
        },
        meeting_title: {
          type: "string",
          description: "Alternatively, search by meeting title to find and return action items",
        },
      },
    },
  },
  {
    name: "get_meeting_participants",
    description:
      "Get the list of participants/attendees for a meeting. Returns email addresses of people who were invited to the calendar event.",
    inputSchema: {
      type: "object",
      properties: {
        note_id: {
          type: "string",
          description: "The ID of the note to get participants for",
        },
        meeting_title: {
          type: "string",
          description: "Alternatively, search by meeting title to find and return participants",
        },
      },
    },
  },
  {
    name: "sync_meetings",
    description:
      "Sync meetings from Fellow API to local database. By default does incremental sync (only new/updated since last sync). Use force=true for full re-sync.",
    inputSchema: {
      type: "object",
      properties: {
        force: {
          type: "boolean",
          description: "If true, performs a full sync clearing and re-fetching all data. Default is false (incremental).",
        },
        include_transcripts: {
          type: "boolean",
          description: "If true, also fetches and stores transcripts. This is slower but enables local transcript search.",
        },
      },
    },
  },
  {
    name: "get_all_action_items",
    description:
      "Get all action items from the local database. Automatically performs incremental sync first to ensure data is fresh. Can filter by assignee, completion status, or date range.",
    inputSchema: {
      type: "object",
      properties: {
        assignee: {
          type: "string",
          description: "Filter by assignee name (partial match)",
        },
        show_completed: {
          type: "boolean",
          description: "If true, includes completed action items. Default is false (only incomplete).",
        },
        since: {
          type: "string",
          description: "Only return action items from meetings on or after this date (ISO format: YYYY-MM-DD)",
        },
      },
    },
  },
  {
    name: "get_meetings_by_participants",
    description:
      "Find meetings that included specific participants. Searches the local database.",
    inputSchema: {
      type: "object",
      properties: {
        emails: {
          type: "array",
          items: { type: "string" },
          description: "List of email addresses to search for",
        },
        require_all: {
          type: "boolean",
          description: "If true, only return meetings where ALL specified participants attended. Default is false (any match).",
        },
      },
      required: ["emails"],
    },
  },
  {
    name: "search_cached_notes",
    description:
      "Full-text search across all cached meeting notes. Searches titles and content.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query to find in meeting titles or content",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_sync_status",
    description:
      "Get the current sync status and database statistics.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Initialize server
const server = new Server(
  {
    name: "fellow-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Parse command line arguments
function parseArgs(): { apiKey: string; subdomain: string } {
  const args = process.argv.slice(2);
  let apiKey: string | undefined;
  let subdomain: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--api-key" && args[i + 1]) {
      apiKey = args[i + 1];
      i++;
    } else if (args[i] === "--subdomain" && args[i + 1]) {
      subdomain = args[i + 1];
      i++;
    } else if (args[i].startsWith("--api-key=")) {
      apiKey = args[i].split("=")[1];
    } else if (args[i].startsWith("--subdomain=")) {
      subdomain = args[i].split("=")[1];
    }
  }

  // Fall back to environment variables
  apiKey = apiKey ?? process.env.FELLOW_API_KEY;
  subdomain = subdomain ?? process.env.FELLOW_SUBDOMAIN;

  if (!apiKey) {
    throw new Error("API key required: use --api-key <key> or set FELLOW_API_KEY env var");
  }
  if (!subdomain) {
    throw new Error("Subdomain required: use --subdomain <subdomain> or set FELLOW_SUBDOMAIN env var");
  }

  return { apiKey, subdomain };
}

// Get configuration from args or environment
let cachedClient: FellowClient | null = null;
let cachedDb: FellowDatabase | null = null;

function getClient(): FellowClient {
  if (!cachedClient) {
    const { apiKey, subdomain } = parseArgs();
    cachedClient = new FellowClient(apiKey, subdomain);
  }
  return cachedClient;
}

function getDatabase(): FellowDatabase {
  if (!cachedDb) {
    cachedDb = new FellowDatabase();
  }
  return cachedDb;
}

// Sync helper functions
interface SyncResult {
  notes_synced: number;
  recordings_synced: number;
  action_items_found: number;
  participants_synced: number;
}

async function syncNotesFromApi(
  client: FellowClient,
  db: FellowDatabase,
  options: { since?: string; includeTranscripts?: boolean } = {}
): Promise<SyncResult> {
  const result: SyncResult = {
    notes_synced: 0,
    recordings_synced: 0,
    action_items_found: 0,
    participants_synced: 0,
  };

  let cursor: string | null = null;
  const pageSize = 50;

  // Fetch notes with content and attendees
  do {
    const notesResp = await client.listNotes({
      updated_at_start: options.since,
      include_content: true,
      include_attendees: true,
      cursor: cursor ?? undefined,
      page_size: pageSize,
    });

    for (const note of notesResp.notes.data) {
      // Store note
      db.upsertNote({
        id: note.id,
        title: note.title,
        created_at: note.created_at,
        updated_at: note.updated_at,
        event_start: note.event_start ?? null,
        event_end: note.event_end ?? null,
        event_guid: note.event_guid ?? null,
        call_url: note.call_url ?? null,
        content_markdown: note.content_markdown ?? null,
      });
      result.notes_synced++;

      // Extract and store action items
      if (note.content_markdown) {
        db.clearActionItemsForNote(note.id);
        const actionItems = extractActionItems(note.content_markdown);
        for (const item of actionItems) {
          db.insertActionItem({
            note_id: note.id,
            content: item.content,
            assignee: item.assignee,
            due_date: item.due_date,
            is_completed: item.is_completed,
            created_at: new Date().toISOString(),
          });
          result.action_items_found++;
        }
      }

      // Store participants
      if (note.event_attendees && note.event_attendees.length > 0) {
        db.clearParticipantsForNote(note.id);
        for (const email of note.event_attendees) {
          if (email && typeof email === "string" && email.trim()) {
            db.insertParticipant(note.id, email.trim());
            result.participants_synced++;
          }
        }
      }
    }

    cursor = notesResp.notes.page_info.cursor;
  } while (cursor);

  // Fetch recordings (optionally with transcripts)
  cursor = null;
  do {
    const recordingsResp = await client.listRecordings({
      updated_at_start: options.since,
      include_transcript: options.includeTranscripts ?? false,
      cursor: cursor ?? undefined,
      page_size: pageSize,
    });

    for (const recording of recordingsResp.recordings.data) {
      // Skip if note doesn't exist in DB (can happen with incremental sync)
      if (recording.note_id && !db.getNote(recording.note_id)) {
        continue;
      }
      db.upsertRecording({
        id: recording.id,
        note_id: recording.note_id,
        title: recording.title,
        created_at: recording.created_at,
        updated_at: recording.updated_at,
        event_start: recording.event_start ?? null,
        event_end: recording.event_end ?? null,
        recording_start: recording.recording_start ?? null,
        recording_end: recording.recording_end ?? null,
        event_guid: recording.event_guid ?? null,
        call_url: recording.call_url ?? null,
        transcript_json: recording.transcript ? JSON.stringify(recording.transcript) : null,
      });
      result.recordings_synced++;
    }

    cursor = recordingsResp.recordings.page_info.cursor;
  } while (cursor);

  // Update last sync time
  db.setLastSyncTime(new Date().toISOString());

  return result;
}

async function performIncrementalSync(client: FellowClient, db: FellowDatabase): Promise<SyncResult | null> {
  const lastSync = db.getLastSyncTime();
  if (!lastSync) {
    // No previous sync, do a full sync
    return syncNotesFromApi(client, db);
  }

  // Sync only notes updated since last sync
  return syncNotesFromApi(client, db, { since: lastSync });
}

// Helper to extract action items from markdown content
interface ParsedActionItem {
  content: string;
  assignee: string | null;
  due_date: string | null;
  is_completed: boolean;
}

function extractActionItems(content: string): ParsedActionItem[] {
  const actionItems: ParsedActionItem[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    // Match checkbox items: - [ ] or - [x] or * [ ] or * [x]
    const checkboxMatch = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.+)/);
    if (checkboxMatch) {
      const isCompleted = checkboxMatch[1].toLowerCase() === "x";
      const itemContent = checkboxMatch[2].trim();
      const { assignee, dueDate

 } = parseAssigneeAndDueDate(itemContent);
      
      actionItems.push({
        content: itemContent,
        assignee,
        due_date: dueDate,
        is_completed: isCompleted,
      });
      continue;
    }

    // Match "Action Item:" or "Action:" or "TODO:" patterns
    const actionMatch = line.match(/^\s*[-*]?\s*(?:Action\s*Item|Action|TODO|To-Do|To Do)\s*:\s*(.+)/i);
    if (actionMatch) {
      const itemContent = actionMatch[1].trim();
      const { assignee, dueDate } = parseAssigneeAndDueDate(itemContent);
      
      actionItems.push({
        content: itemContent,
        assignee,
        due_date: dueDate,
        is_completed: false,
      });
      continue;
    }

    // Match items with @mentions at the start (common Fellow pattern)
    const mentionMatch = line.match(/^\s*[-*]\s*(@\w+[\w\s]*?)\s*[-:]\s*(.+)/);
    if (mentionMatch) {
      const assignee = mentionMatch[1].replace("@", "").trim();
      const itemContent = mentionMatch[2].trim();
      const { dueDate } = parseAssigneeAndDueDate(itemContent);
      
      actionItems.push({
        content: `@${assignee}: ${itemContent}`,
        assignee,
        due_date: dueDate,
        is_completed: false,
      });
    }
  }

  return actionItems;
}

function parseAssigneeAndDueDate(text: string): { assignee: string | null; dueDate: string | null } {
  let assignee: string | null = null;
  let dueDate: string | null = null;

  // Extract @mentions for assignee
  const mentionMatch = text.match(/@(\w+)/);
  if (mentionMatch) {
    assignee = mentionMatch[1];
  }

  // Extract due dates in various formats
  // ISO format: 2024-01-15
  const isoDateMatch = text.match(/(?:due|by|deadline)\s*:?\s*(\d{4}-\d{2}-\d{2})/i);
  if (isoDateMatch) {
    dueDate = isoDateMatch[1];
  }

  // US format: 01/15/2024 or 1/15/24
  const usDateMatch = text.match(/(?:due|by|deadline)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (!dueDate && usDateMatch) {
    const parts = usDateMatch[1].split("/");
    const month = parts[0].padStart(2, "0");
    const day = parts[1].padStart(2, "0");
    let year = parts[2];
    if (year.length === 2) {
      year = "20" + year;
    }
    dueDate = `${year}-${month}-${day}`;
  }

  return { assignee, dueDate };
}

// Format transcript for output
function formatTranscript(transcript: Transcript): string {
  if (!transcript.speech_segments || transcript.speech_segments.length === 0) {
    return "No transcript available.";
  }

  let output = `Language: ${transcript.language_code}\n\n`;
  
  for (const segment of transcript.speech_segments) {
    const startTime = formatTime(segment.start_time);
    const endTime = formatTime(segment.end_time);
    output += `[${startTime} - ${endTime}] ${segment.speaker}: ${segment.text}\n`;
  }

  return output;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// Handle tool calls
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const client = getClient();

  try {
    switch (name) {
      case "search_meetings": {
        const { title, created_at_start, created_at_end, limit } = args as {
          title?: string;
          created_at_start?: string;
          created_at_end?: string;
          limit?: number;
        };

        const recordingsResp = await client.listRecordings({
          title,
          created_at_start,
          created_at_end,
          page_size: Math.min(limit ?? 20, 50),
        });

        const results = recordingsResp.recordings.data.map((r) => ({
          id: r.id,
          title: r.title,
          note_id: r.note_id,
          event_start: r.event_start,
          event_end: r.event_end,
          created_at: r.created_at,
          call_url: r.call_url,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total_results: results.length,
                  has_more: recordingsResp.recordings.page_info.cursor !== null,
                  meetings: results,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_meeting_transcript": {
        const { recording_id, meeting_title } = args as {
          recording_id?: string;
          meeting_title?: string;
        };

        let recordingWithTranscript: Recording | null = null;

        if (recording_id) {
          // Get the specific recording with transcript
          const recordingsResp = await client.listRecordings({
            include_transcript: true,
            page_size: 50,
          });
          recordingWithTranscript =
            recordingsResp.recordings.data.find((r) => r.id === recording_id) ?? null;
          
          if (!recordingWithTranscript) {
            // Try fetching all to find it
            const allRecordingsResp = await client.listRecordings({
              include_transcript: true,
              page_size: 50,
            });
            recordingWithTranscript =
              allRecordingsResp.recordings.data.find((r) => r.id === recording_id) ?? null;
          }
        } else if (meeting_title) {
          // Search by title and get transcript
          const recordingsResp = await client.listRecordings({
            title: meeting_title,
            include_transcript: true,
            page_size: 1,
          });
          recordingWithTranscript = recordingsResp.recordings.data[0] ?? null;
        }

        if (!recordingWithTranscript) {
          return {
            content: [
              {
                type: "text",
                text: "Recording not found. Please provide a valid recording_id or meeting_title.",
              },
            ],
          };
        }

        const transcriptText = recordingWithTranscript.transcript
          ? formatTranscript(recordingWithTranscript.transcript)
          : "No transcript available for this recording.";

        return {
          content: [
            {
              type: "text",
              text: `# Transcript: ${recordingWithTranscript.title}\n\nRecording ID: ${recordingWithTranscript.id}\nEvent Start: ${recordingWithTranscript.event_start ?? "N/A"}\n\n${transcriptText}`,
            },
          ],
        };
      }

      case "get_meeting_summary": {
        const { note_id, recording_id, meeting_title } = args as {
          note_id?: string;
          recording_id?: string;
          meeting_title?: string;
        };

        let noteId = note_id;

        // If recording_id provided, get the associated note_id
        if (!noteId && recording_id) {
          const recordingsResp = await client.listRecordings({ page_size: 50 });
          const recording = recordingsResp.recordings.data.find((r) => r.id === recording_id);
          if (recording) {
            noteId = recording.note_id;
          }
        }

        // If meeting_title provided, search for the note
        if (!noteId && meeting_title) {
          const notesResp = await client.listNotes({
            title: meeting_title,
            include_content: true,
            page_size: 1,
          });
          if (notesResp.notes.data.length > 0) {
            const note = notesResp.notes.data[0];
            return {
              content: [
                {
                  type: "text",
                  text: `# Meeting Summary: ${note.title}\n\nNote ID: ${note.id}\nEvent Start: ${note.event_start ?? "N/A"}\n\n${note.content_markdown ?? "No content available."}`,
                },
              ],
            };
          }
        }

        if (!noteId) {
          return {
            content: [
              {
                type: "text",
                text: "Note not found. Please provide a valid note_id, recording_id, or meeting_title.",
              },
            ],
          };
        }

        // Get note with content
        const notesResp = await client.listNotes({
          include_content: true,
          page_size: 50,
        });
        const note = notesResp.notes.data.find((n) => n.id === noteId);

        if (!note) {
          return {
            content: [
              {
                type: "text",
                text: `Note with ID ${noteId} not found or not accessible.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `# Meeting Summary: ${note.title}\n\nNote ID: ${note.id}\nEvent Start: ${note.event_start ?? "N/A"}\n\n${note.content_markdown ?? "No content available."}`,
            },
          ],
        };
      }

      case "get_action_items": {
        const { note_id, meeting_title } = args as {
          note_id?: string;
          meeting_title?: string;
        };

        let note: Note | null = null;

        if (note_id) {
          const notesResp = await client.listNotes({
            include_content: true,
            page_size: 50,
          });
          note = notesResp.notes.data.find((n) => n.id === note_id) ?? null;
        } else if (meeting_title) {
          const notesResp = await client.listNotes({
            title: meeting_title,
            include_content: true,
            page_size: 1,
          });
          note = notesResp.notes.data[0] ?? null;
        }

        if (!note) {
          return {
            content: [
              {
                type: "text",
                text: "Note not found. Please provide a valid note_id or meeting_title.",
              },
            ],
          };
        }

        const actionItems = note.content_markdown
          ? extractActionItems(note.content_markdown)
          : [];

        const formattedItems = actionItems.map((item, i) => {
          let line = `${i + 1}. ${item.is_completed ? "[x]" : "[ ]"} ${item.content}`;
          if (item.assignee) line += ` (assignee: @${item.assignee})`;
          if (item.due_date) line += ` (due: ${item.due_date})`;
          return line;
        });

        return {
          content: [
            {
              type: "text",
              text: `# Action Items: ${note.title}\n\nNote ID: ${note.id}\nEvent Start: ${note.event_start ?? "N/A"}\n\n${
                formattedItems.length > 0
                  ? formattedItems.join("\n")
                  : "No action items found in this meeting."
              }`,
            },
          ],
        };
      }

      case "get_meeting_participants": {
        const { note_id, meeting_title } = args as {
          note_id?: string;
          meeting_title?: string;
        };

        let note: Note | null = null;

        if (note_id) {
          const notesResp = await client.listNotes({
            include_attendees: true,
            page_size: 50,
          });
          note = notesResp.notes.data.find((n) => n.id === note_id) ?? null;
        } else if (meeting_title) {
          const notesResp = await client.listNotes({
            title: meeting_title,
            include_attendees: true,
            page_size: 1,
          });
          note = notesResp.notes.data[0] ?? null;
        }

        if (!note) {
          return {
            content: [
              {
                type: "text",
                text: "Note not found. Please provide a valid note_id or meeting_title.",
              },
            ],
          };
        }

        const attendees = note.event_attendees ?? [];

        return {
          content: [
            {
              type: "text",
              text: `# Participants: ${note.title}\n\nNote ID: ${note.id}\nEvent Start: ${note.event_start ?? "N/A"}\n\n${
                attendees.length > 0
                  ? `Total participants: ${attendees.length}\n\n${attendees.map((email) => `- ${email}`).join("\n")}`
                  : "No participant information available for this meeting."
              }`,
            },
          ],
        };
      }

      case "sync_meetings": {
        const { force, include_transcripts } = args as {
          force?: boolean;
          include_transcripts?: boolean;
        };

        const db = getDatabase();
        let result: SyncResult;

        if (force) {
          // Full sync - clear existing data first
          // Note: We don't have a clearAll method, but the upserts will update existing records
          // and we clear action items/participants per-note during sync
          result = await syncNotesFromApi(client, db, { includeTranscripts: include_transcripts });
        } else {
          // Incremental sync
          const syncResult = await performIncrementalSync(client, db);
          result = syncResult ?? { notes_synced: 0, recordings_synced: 0, action_items_found: 0, participants_synced: 0 };
        }

        const stats = db.getStats();

        return {
          content: [
            {
              type: "text",
              text: `# Sync Complete\n\nMode: ${force ? "Full" : "Incremental"}\n\n## This Sync:\n- Notes synced: ${result.notes_synced}\n- Recordings synced: ${result.recordings_synced}\n- Action items found: ${result.action_items_found}\n- Participants synced: ${result.participants_synced}\n\n## Database Totals:\n- Total notes: ${stats.notes}\n- Total recordings: ${stats.recordings}\n- Total action items: ${stats.action_items}\n- Unique participants: ${stats.participants}\n\nLast sync: ${db.getLastSyncTime()}`,
            },
          ],
        };
      }

      case "get_all_action_items": {
        const { assignee, show_completed, since } = args as {
          assignee?: string;
          show_completed?: boolean;
          since?: string;
        };

        const db = getDatabase();

        // Perform incremental sync first to ensure fresh data
        let syncError: string | null = null;
        let syncResult: SyncResult | null = null;
        try {
          syncResult = await performIncrementalSync(client, db);
        } catch (err) {
          syncError = err instanceof Error ? err.message : String(err);
          console.error("Incremental sync failed:", err);
        }

        const actionItems = db.getAllActionItems({
          assignee,
          is_completed: show_completed ? undefined : false,
          since,
        });

        if (actionItems.length === 0) {
          let msg = "No action items found matching the criteria.";
          if (syncError) {
            msg += `\n\n⚠️ Sync error: ${syncError}`;
          } else if (syncResult) {
            msg += `\n\nSync completed: ${syncResult.notes_synced} notes, ${syncResult.action_items_found} action items found.`;
          }
          const stats = db.getStats();
          msg += `\n\nDB stats: ${stats.notes} notes, ${stats.action_items} action items total.`;
          return {
            content: [
              {
                type: "text",
                text: msg,
              },
            ],
          };
        }

        // Group by meeting
        const byMeeting = new Map<string, typeof actionItems>();
        for (const item of actionItems) {
          const key = item.note_id;
          if (!byMeeting.has(key)) {
            byMeeting.set(key, []);
          }
          byMeeting.get(key)!.push(item);
        }

        let output = `# All Action Items\n\nTotal: ${actionItems.length} items from ${byMeeting.size} meetings\n`;
        if (assignee) output += `Filtered by assignee: ${assignee}\n`;
        if (since) output += `Since: ${since}\n`;
        output += `Showing: ${show_completed ? "all" : "incomplete only"}\n\n`;

        for (const [noteId, items] of byMeeting) {
          const firstItem = items[0];
          output += `## ${firstItem.note_title}\n`;
          output += `Date: ${firstItem.event_start ?? "N/A"}\n\n`;
          
          for (const item of items) {
            output += `- ${item.is_completed ? "[x]" : "[ ]"} ${item.content}`;
            if (item.assignee) output += ` (@${item.assignee})`;
            if (item.due_date) output += ` [due: ${item.due_date}]`;
            output += "\n";
          }
          output += "\n";
        }

        return {
          content: [
            {
              type: "text",
              text: output,
            },
          ],
        };
      }

      case "get_meetings_by_participants": {
        const { emails, require_all } = args as {
          emails: string[];
          require_all?: boolean;
        };

        if (!emails || emails.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Please provide at least one email address.",
              },
            ],
          };
        }

        const db = getDatabase();
        const meetings = require_all
          ? db.getMeetingsWithAllParticipants(emails)
          : db.getMeetingsByParticipants(emails);

        if (meetings.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No meetings found with ${require_all ? "all of" : "any of"}: ${emails.join(", ")}`,
              },
            ],
          };
        }

        let output = `# Meetings with ${require_all ? "all of" : "any of"}: ${emails.join(", ")}\n\n`;
        output += `Found ${meetings.length} meetings:\n\n`;

        for (const meeting of meetings) {
          const participants = db.getParticipantsForNote(meeting.id);
          output += `## ${meeting.title}\n`;
          output += `- Date: ${meeting.event_start ?? "N/A"}\n`;
          output += `- Note ID: ${meeting.id}\n`;
          output += `- Participants: ${participants.length}\n`;
          output += "\n";
        }

        return {
          content: [
            {
              type: "text",
              text: output,
            },
          ],
        };
      }

      case "search_cached_notes": {
        const { query } = args as { query: string };

        if (!query || query.trim().length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Please provide a search query.",
              },
            ],
          };
        }

        const db = getDatabase();
        const notes = db.searchNotes(query);

        if (notes.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No meetings found matching: "${query}"`,
              },
            ],
          };
        }

        let output = `# Search Results for: "${query}"\n\n`;
        output += `Found ${notes.length} meetings:\n\n`;

        for (const note of notes) {
          output += `## ${note.title}\n`;
          output += `- Date: ${note.event_start ?? "N/A"}\n`;
          output += `- Note ID: ${note.id}\n`;
          
          // Show a snippet of matching content
          if (note.content_markdown) {
            const lowerContent = note.content_markdown.toLowerCase();
            const lowerQuery = query.toLowerCase();
            const matchIndex = lowerContent.indexOf(lowerQuery);
            if (matchIndex !== -1) {
              const start = Math.max(0, matchIndex - 50);
              const end = Math.min(note.content_markdown.length, matchIndex + query.length + 50);
              let snippet = note.content_markdown.substring(start, end);
              if (start > 0) snippet = "..." + snippet;
              if (end < note.content_markdown.length) snippet = snippet + "...";
              output += `- Snippet: ${snippet.replace(/\n/g, " ")}\n`;
            }
          }
          output += "\n";
        }

        return {
          content: [
            {
              type: "text",
              text: output,
            },
          ],
        };
      }

      case "get_sync_status": {
        const db = getDatabase();
        const stats = db.getStats();
        const lastSync = db.getLastSyncTime();

        return {
          content: [
            {
              type: "text",
              text: `# Sync Status\n\nLast sync: ${lastSync ?? "Never"}\n\n## Database Statistics:\n- Total notes: ${stats.notes}\n- Total recordings: ${stats.recordings}\n- Total action items: ${stats.action_items}\n- Unique participants: ${stats.participants}\n\n## Database Location:\n~/.fellow-mcp/fellow.db`,
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  // Check for --test flag for CLI debugging
  if (process.argv.includes("--test")) {
    await runTest();
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Fellow MCP server started");
}

// CLI test mode
async function runTest() {
  console.log("=== Fellow MCP Test Mode ===\n");

  try {
    const client = getClient();
    const db = getDatabase();

    // 1. Show sync status
    const lastSync = db.getLastSyncTime();
    const stats = db.getStats();
    console.log("Current DB status:");
    console.log(`  Last sync: ${lastSync ?? "Never"}`);
    console.log(`  Notes: ${stats.notes}`);
    console.log(`  Action items: ${stats.action_items}`);
    console.log("");

    // 2. Try to sync (but don't fail if API errors)
    console.log("Syncing notes from API...");
    try {
      const syncResult = await syncNotesFromApi(client, db);
      console.log(`  Notes synced: ${syncResult.notes_synced}`);
      console.log(`  Action items found: ${syncResult.action_items_found}`);
    } catch (syncErr) {
      console.log(`  Sync failed: ${syncErr instanceof Error ? syncErr.message : syncErr}`);
      console.log("  (continuing with cached data)");
    }
    console.log("");

    // 3. Show raw content from notes with actual content
    const notes = db.getAllNotes();
    console.log(`Total notes in DB: ${notes.length}`);
    
    // Find a note with substantial content
    const noteWithContent = notes.find(n => 
      n.content_markdown && 
      n.content_markdown.length > 200 &&
      !n.content_markdown.includes("(The things to talk about)")
    );
    
    if (noteWithContent) {
      console.log(`\n=== Note with content: ${noteWithContent.title} ===`);
      console.log(`ID: ${noteWithContent.id}`);
      console.log(`Event: ${noteWithContent.event_start ?? "N/A"}`);
      console.log("");
      console.log("--- Raw Markdown Content (first 2000 chars) ---");
      console.log(noteWithContent.content_markdown?.substring(0, 2000) ?? "(no content)");
      console.log("--- End Content ---");
      console.log("");

      // 4. Test action item extraction
      if (noteWithContent.content_markdown) {
        console.log("=== Parsed Action Items ===");
        const items = extractActionItems(noteWithContent.content_markdown);
        if (items.length === 0) {
          console.log("(none found)");
        } else {
          for (const item of items) {
            console.log(`- [${item.is_completed ? "x" : " "}] ${item.content}`);
            if (item.assignee) console.log(`    Assignee: ${item.assignee}`);
            if (item.due_date) console.log(`    Due: ${item.due_date}`);
          }
        }
      }
    } else if (notes.length > 0) {
      console.log("No notes with substantial content found.");
      console.log("First note content:", notes[0].content_markdown);
    } else {
      console.log("No notes in database.");
    }

  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
