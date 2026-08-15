/**
 * ChaseEmail.gs — NL Tools Consolidated GAS
 * Version: v1.1 (conversation turn 163)
 * Date: 17/04/2026
 *
 * CHANGELOG
 * v1.1 (17/04/2026)
 *   - Updated prompt to use guided panel fields:
 *     guidedAction, guidedDeadline, guidedImpact, guidedExtras
 *   - Prompt now builds a richer, more specific email using all
 *     structured inputs from the 6-step guided flow in Chase HQ
 *
 * v1.0 (17/04/2026)
 *   - Initial build — Anthropic API proxy for Chase HQ
 *
 * Script Property required:
 *   ANTHROPIC_KEY — Anthropic API key from console.anthropic.com
 *
 * Called from Chase HQ via doPost action: 'chaseEmail'
 * Body fields:
 *   title, contact, contactType, chaseCount, urgency, context, chaseDate
 *   guidedAction, guidedDeadline, guidedImpact, guidedExtras
 */

function generateChaseEmail(body) {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
  if (!key) {
    return { ok: false, error: 'ANTHROPIC_KEY not set in Script Properties.' };
  }

  var toneMap  = { 0: 'Nudge', 1: 'Firm' };
  var count    = parseInt(body.chaseCount, 10) || 0;
  var tone     = count <= 1 ? (toneMap[count] || 'Nudge') : 'Formal';
  var typeStr  = body.contactType === 'internal' ? 'internal colleague' : 'external contact';
  var chaseNum = count + 1;

  var prompt = 'Write a professional chase email using all of the following details:\n'
    + '- Recipient name: '    + (body.contact  || 'the recipient') + '\n'
    + '- Relationship: '      + typeStr + '\n'
    + '- What I am waiting on: ' + (body.title || '') + '\n';

  if (body.context)        prompt += '- Background context: '           + body.context        + '\n';
  if (body.guidedAction)   prompt += '- What I need them to do: '       + body.guidedAction   + '\n';
  if (body.guidedDeadline) prompt += '- Deadline: '                     + body.guidedDeadline + '\n';
  if (body.guidedImpact)   prompt += '- What happens if no response: '  + body.guidedImpact   + '\n';
  if (body.guidedExtras)   prompt += '- Additional details to include: ' + body.guidedExtras  + '\n';
  if (body.chaseDate)      prompt += '- Originally due: '               + body.chaseDate      + '\n';

  prompt += '- Chase number: ' + chaseNum + ' (tone should be: ' + tone + ')\n'
    + '- Urgency: ' + (body.urgency || 'medium') + '\n'
    + '\nTone guide:\n'
    + '  Nudge = friendly, low-pressure, assumes good faith.\n'
    + '  Firm = direct, acknowledges delay, flags impact on sender\'s work.\n'
    + '  Formal = professional and serious, references that this is a repeated follow-up, may request alternative contact.\n'
    + '\nFor internal contacts, keep the tone warmer throughout — even formal escalations should not feel cold.\n'
    + 'Use the specific details provided above — do not write a generic chase email.\n'
    + 'Write only the email body. No subject line. No "Dear" preamble unless Formal tone. '
    + 'Sign off appropriately. Be concise — 3 to 5 sentences for Nudge/Firm, slightly longer for Formal.';

  var payload = JSON.stringify({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 400,
    system:     'You write professional, natural-sounding chase emails on behalf of an operations executive at a football league organisation. Never use filler phrases like "I hope this finds you well" or "I trust you are well". Be direct and human. Use all context provided.',
    messages:   [{ role: 'user', content: prompt }]
  });

  var options = {
    method:             'post',
    contentType:        'application/json',
    headers: {
      'x-api-key':         key,
      'anthropic-version': '2023-06-01'
    },
    payload:            payload,
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  var code     = response.getResponseCode();
  var text     = response.getContentText();

  if (code !== 200) {
    return { ok: false, error: 'Anthropic API error (' + code + '): ' + text };
  }

  var data = JSON.parse(text);
  if (!data.content || !data.content[0] || !data.content[0].text) {
    return { ok: false, error: 'Unexpected response from Anthropic API.' };
  }

  return { ok: true, email: data.content[0].text };
}