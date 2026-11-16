# n8n-nodes-bannx

This is an n8n community node. It lets you use [Bannx](https://bannx.com) in your n8n workflows.

Bannx renders editable design templates to images, PDFs and short videos from your data. Use it to make social posts, OG images, certificates, invoices or ad sets from rows, form replies or AI output.

[Installation](#installation) · [Operations](#operations) · [Credentials](#credentials) · [Compatibility](#compatibility) · [Usage](#usage) · [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation and install `n8n-nodes-bannx`.

## Operations

**Bannx**

- Template → Render: render a template with your data to PNG, WebP, SVG, PDF, MP4, WebM or GIF and get the file URL. The template's variables appear as fields to map.
- Template → Get Many: list the templates in your space, with search.
- Render → Get Many: get the latest finished renders.

The node can be used as a tool by the n8n AI Agent.

**Bannx Trigger**

- Render Completed: start a workflow when a template finishes rendering, optionally for one template only. Deliveries are signed (HMAC-SHA256) and unsigned ones are rejected.

## Credentials

1. In Bannx, open Settings → Space → Developers and create an API key. Leave its scopes unrestricted, or allow Template Render API, Template Read API and Webhook Subscriptions API.
2. In n8n, create a **Bannx API** credential and paste the key. Leave Base URL as `https://bannx.com`.

The Bannx Trigger needs a key created by someone allowed to manage webhooks in the space (the owner or an admin).

## Compatibility

Built and tested with n8n-workflow 2.16 and `@n8n/node-cli` 0.56. Requires Node.js 22 or newer.

## Usage

**Render a social post for each new row**

1. Google Sheets Trigger: on new row.
2. Bannx → Template → Render: pick your template, map `headline` and `photo` from the row, format PNG.
3. Slack → Send Message: post the `url` from Bannx.

**Let an AI agent design and render**

1. Chat Trigger.
2. AI Agent with the Bannx node as a tool: the agent lists templates, picks one and renders it with the text it wrote.

**React to finished renders**

1. Bannx Trigger: Render Completed.
2. Google Drive → Upload: save the file from the delivery's `url`.

Leave a variable empty to keep the template's own value. Text is converted to each variable's type on the Bannx side (numbers, true/false, lists, objects).

## Resources

- [Bannx n8n guide](https://bannx.com/docs/integrations/n8n)
- [Bannx rendering reference](https://bannx.com/docs/rendering)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
