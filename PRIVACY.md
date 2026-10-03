# Privacy

Client metrics stay on the machine running this plugin. The stdio server does not send the CSV, the draft, or the PDF to a third party. The hosted HTTP endpoint processes the CSV in memory, keeps each rendered PDF in memory for 15 minutes behind an unguessable link, and stores nothing on disk. That host is then the only place the report data goes. The hosted endpoint also counts how many drafts, renders, errors and rate-limited calls it handles each day. Those counts contain no CSV contents, client names, or report text.
