// MeetingNotes.gs
// NL Tools Portal — Meeting Notes AI integration
// Handles: generateMeetingMinutes
//
// API key stored in Script Properties as MEETING_NOTES_ANTHROPIC_KEY
// Separate from CLAUDIO_ANTHROPIC_KEY and ANTHROPIC_KEY for billing separation.
//
// Called from: /tools/meeting-notes/index.html
// Routed via: Code.gs doPost → case 'generateMeetingMinutes'
//
// DEPLOYMENT: Do not update existing deployment.
// Always create a new deployment and update NL_GAS_URL in meeting-notes/index.html.

function getChangelog() {
  return [
    {
      version: '1.0',
      date: '23/04/2026',
      changes: [
        'Initial build — generateMeetingMinutes action',
        'Calls Anthropic claude-sonnet-4-20250514 via UrlFetchApp',
        'Parses action points from lines beginning with "Action:"',
        'API key read from Script Properties: ANTHROPIC_API_KEY'
      ]
    }
  ];
}

/**
 * Generate meeting minutes from owner notes + any shared participant notes.
 *
 * Expected params:
 *   params.prompt        — full formatted prompt string built by the client
 *   params.meetingId     — RTDB key of the meeting (for logging)
 *   params.meetingTitle  — human label for the meeting (for logging)
 *
 * Returns:
 *   { success: true,  minutes: string, actions: [{title, due, assignee, status}] }
 *   { success: false, error: string }
 */
function generateMeetingMinutes(params) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('MEETING_NOTES_ANTHROPIC_KEY');
  if (!apiKey) {
    return { success: false, error: 'ANTHROPIC_API_KEY not set in Script Properties' };
  }

  if (!params.prompt) {
    return { success: false, error: 'No prompt provided' };
  }

  try {
    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json'
      },
      payload: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [
          { role: 'user', content: params.prompt }
        ]
      }),
      muteHttpExceptions: true
    });

    var status = response.getResponseCode();
    var body   = response.getContentText();

    if (status !== 200) {
      Logger.log('Anthropic API error ' + status + ': ' + body);
      return { success: false, error: 'API returned status ' + status };
    }

    var result  = JSON.parse(body);
    var text    = result.content && result.content[0] && result.content[0].text
      ? result.content[0].text
      : '';

    if (!text) {
      return { success: false, error: 'Empty response from AI' };
    }

    // Parse action points — lines beginning with "Action:"
    var actions = [];
    var lines   = text.split('\n');
    lines.forEach(function(line) {
      var trimmed = line.trim();
      if (/^Action:/i.test(trimmed)) {
        var content = trimmed.replace(/^Action:\s*/i, '');
        // Try to extract due date: "— due DD Mon YYYY" or "— due DD/MM/YYYY"
        var dueMatch    = content.match(/[-–]\s*due\s+([^—–]+?)(\s*[-–]|$)/i);
        // Try to extract assignee: final "— Name" segment after due
        var assignMatch = content.match(/[-–]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$/);
        var title       = content
          .replace(/[-–]\s*due\s+[^—–]+/i, '')
          .replace(/[-–]\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s*$/, '')
          .trim();
        actions.push({
          title:    title || content,
          due:      dueMatch    ? dueMatch[1].trim()    : '',
          assignee: assignMatch ? assignMatch[1].trim() : '',
          status:   'open'
        });
      }
    });

    Logger.log('Meeting minutes generated for: ' + (params.meetingTitle || params.meetingId));

    return {
      success: true,
      minutes: text,
      actions: actions
    };

  } catch (e) {
    Logger.log('generateMeetingMinutes exception: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}