# Fellow MCP Server

A local MCP (Model Context Protocol) server that wraps the Fellow.ai API, providing tools to access meeting data, transcripts, summaries, action items, and participants.

**Features:**
- Local SQLite database for caching meeting data
- Automatic incremental sync to keep action items fresh
- Full-text search across cached notes
- Find meetings by participant

## Installation

```bash
npm install -g fellow-mcp
```

## Setup

### 1. Get your Fellow API credentials

1. Log into your Fellow account
2. Navigate to Developer API settings in your User settings
3. Generate a new API key
4. Note your workspace subdomain (the part before `.fellow.app` in your URL)

### 2. Configure your MCP client

Add the following to your MCP client configuration (e.g., `~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "fellow": {
      "type": "local",
      "command": ["npx", "-y", "fellow-mcp"],
      "environment": {
        "FELLOW_API_KEY": "YOUR_FELLOW_API_KEY_HERE",
        "FELLOW_SUBDOMAIN": "YOUR_SUBDOMAIN"
      },
      "enabled": true
    }
  }
}
```

## Available Tools

### API Tools (Direct Fellow API calls)

#### `search_meetings`
Search for meetings/recordings in Fellow.

**Parameters:**
- `title` (optional): Filter by meeting title (case-insensitive partial match)
- `created_at_start` (optional): Filter meetings created after this date (ISO format)
- `created_at_end` (optional): Filter meetings created before this date (ISO format)
- `limit` (optional): Maximum number of results (1-50, default 20)

#### `get_meeting_transcript`
Get the full transcript of a meeting recording with speaker labels and timestamps.

**Parameters:**
- `recording_id` (optional): The ID of the recording
- `meeting_title` (optional): Search by meeting title

#### `get_meeting_summary`
Get the meeting summary/notes content including agenda items, discussion topics, and decisions.

**Parameters:**
- `note_id` (optional): The ID of the note
- `recording_id` (optional): Get the summary for a recording's associated note
- `meeting_title` (optional): Search by meeting title

#### `get_action_items`
Extract action items from a single meeting's notes.

**Parameters:**
- `note_id` (optional): The ID of the note
- `meeting_title` (optional): Search by meeting title

#### `get_meeting_participants`
Get the list of participants/attendees for a meeting.

**Parameters:**
- `note_id` (optional): The ID of the note
- `meeting_title` (optional): Search by meeting title

### Database Tools (Local SQLite cache)

#### `sync_meetings`
Sync meetings from Fellow API to local database.

**Parameters:**
- `force` (optional, default: false): If true, performs full re-sync. Otherwise does incremental sync (only new/updated since last sync)
- `include_transcripts` (optional, default: false): If true, also fetches and stores transcripts (slower)

#### `get_all_action_items`
Get all action items from the local database. **Automatically performs incremental sync first** to ensure data is fresh.

**Parameters:**
- `assignee` (optional): Filter by assignee name (partial match)
- `show_completed` (optional, default: false): If true, includes completed action items
- `since` (optional): Only return action items from meetings on or after this date (ISO format: YYYY-MM-DD)

#### `get_meetings_by_participants`
Find meetings that included specific participants.

**Parameters:**
- `emails` (required): List of email addresses to search for
- `require_all` (optional, default: false): If true, only return meetings where ALL specified participants attended

#### `search_cached_notes`
Full-text search across all cached meeting notes (titles and content).

**Parameters:**
- `query` (required): Search query

#### `get_sync_status`
Get the current sync status and database statistics.

## Local Database

Meeting data is cached in a local SQLite database at `~/.fellow-mcp/fellow.db`. This enables:

- Fast local searches
- Querying across all action items
- Finding meetings by participant
- Offline access to cached data

The database stores:
- Notes (meeting summaries, agendas, content)
- Recordings (with optional transcripts)
- Action items (parsed from notes with assignee/due date extraction)
- Participants (email addresses)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FELLOW_API_KEY` | Yes | Your Fellow API key |
| `FELLOW_SUBDOMAIN` | Yes | Your Fellow workspace subdomain |

## Development

```bash
# Watch mode for development
npm run dev

# Build
npm run build

# Test API connection
node --env-file=.env test-api.js
```

## Requirements

- Node.js >= 18.0.0
- A Fellow.ai account with API access

## License

MIT

## API Reference

This MCP server wraps the [Fellow Developer API](https://developers.fellow.ai/reference/introduction). The API uses:
- `X-API-KEY` header for authentication
- POST requests for list operations (with JSON body for filters/pagination)
- GET requests for retrieving individual resources
