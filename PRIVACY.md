# Privacy

Client metrics stay on the machine running this plugin. The stdio server does not send the CSV, the draft, or the PDF to a third party. The hosted HTTP endpoint processes the CSV in memory, keeps each rendered PDF in memory for 15 minutes behind an unguessable link, and stores nothing on disk. That host is then the only place the report data goes.
