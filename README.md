# Legal Assistant RAG MCP Tools

MCP tools for Legal Assistant RAG - enables AI assistants to handle clients, cases and documents.

## Overview

This repository contains Model Context Protocol (MCP) tools that integrate with the [Legal Assistant RAG](https://github.com/kevinxe/Legal-Assistant-RAG) application. These tools allow AI assistants to interact with the Legal Assistant RAG backend, performing operations on clients, cases, and documents through a standardized interface.

## Features

- **Document Management**: Upload, list, and delete legal documents for RAG processing
- **Client Management**: Create, edit, list, and delete client records
- **Case Management**: Create, edit, list, and delete legal cases
- **RAG Capabilities**: Ask questions about your legal documents using the RAG system
- **Secure Authentication**: JWT-based authentication with the backend


## Requirements

- Node.js v18+ (v22+ recommended)
- TypeScript
- Access to a running Legal Assistant RAG backend


## Installation

```bash
# Clone the repository
git clone https://github.com/kevinxe/lar-mcp.git
cd lar-mcp

# Install dependencies
npm install
```


## Setup
### Usage with Claude Desktop

To use this with Claude Desktop, add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "legal-assistant": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "path/to/your/src/main.ts"
      ],
      "env": {
        "API_EMAIL": "your-email@example.com",
        "API_PASSWORD": "your-password",
        "API_URL": "http://localhost:3000",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

Where:

- **API_EMAIL**: The email you use to log in to the Legal Assistant RAG system
- **API_PASSWORD**: The password for your Legal Assistant RAG account
- **API_URL**: The URL where the Legal Assistant RAG backend is deployed (default is http://localhost:3000 for local development)
- **MCP_TRANSPORT**: The transport method for the MCP protocol, can be "stdio" or "http"

The `MCP_TRANSPORT` value can be set to either "stdio" or "http", depending on your needs:

- **stdio**: Simpler for local development, runs on your local machine and communicates directly via standard input/output
- **http**: Offers more flexibility for distributed teams, can run locally or remotely and communicates over the network


## Usage

These MCP tools are designed to be used with AI assistants that support the Model Context Protocol, such as Claude via Cursor or Claude Desktop.

### Available Tools

#### Document Management

- `lar-ask`: Ask questions about your legal documents
- `lar-upload-document`: Upload a document from a URL
- `lar-list-documents`: List all available documents
- `lar-delete-document`: Delete a document by name


#### Client Management

- `lar-list-clients`: List all clients
- `lar-create-client`: Create a new client
- `lar-edit-client`: Edit an existing client
- `lar-delete-client`: Delete a client


#### Case Management

- `lar-list-cases`: List all cases
- `lar-create-case`: Create a new legal case
- `lar-edit-case`: Edit an existing case
- `lar-delete-case`: Delete a case

## Development

```bash
# Run the MCP server locally
npm start

# Build for production
npm run build
```


## Integration

This MCP server integrates with the Legal Assistant RAG application, a comprehensive web application built with C\# (.NET 8.0) backend and Angular frontend. The MCP tools communicate with the backend API to perform operations on the system's data.

## License

GNU General Public License (GPL)

## Related Projects

- [Legal Assistant RAG](https://github.com/kevinxe/Legal-Assistant-RAG) - The main web application that this MCP server integrates with