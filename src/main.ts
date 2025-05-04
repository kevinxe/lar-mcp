import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getUserId, loginAPI } from "./utils/login.js";

type TransportMode = "stdio" | "http";
const transportMode = (process.env.MCP_TRANSPORT as TransportMode) || "http";

const server = new McpServer({
  name: "Legal Assistant Rag",
  version: "1.0.0",
  description: "A legal assistant that can answer questions about your documents and more.",
  host: "localhost",
  port: 8080,
});

server.tool(
  'lar-ask',
  'Tool to answer questions about your documents using Legal Assistant RAG.',
  {
    message: z.string().describe('The question to ask the legal assistant.'),
    fileId: z.number().int().positive().describe('The ID of the document to search in.'),
  },
  async ({ message, fileId }) => {
    try {
      const tokenJWT = await loginAPI();
      
      const apiUrl = process.env.API_URL
        ? `${process.env.API_URL}/api/chat/ask`
        : "http://localhost:3000/api/chat/ask";
      
      const requestData = {
        message: message,
        fileId: fileId
      };
      
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenJWT}`,
          "Content-Type": "application/json",
          "Accept": "text/event-stream"
        },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [
            {
              type: "text",
              text: `Error al realizar la consulta: ${response.status} - ${errorText}`
            }
          ]
        };
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        return {
          content: [
            {
              type: "text",
              text: "No se pudo iniciar la lectura de la respuesta en streaming."
            }
          ]
        };
      }
      
      let fullText = "";
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const events = chunk.split("\n\n").filter(Boolean);
        
        for (const event of events) {
          if (event.startsWith("data: ")) {
            const eventData = event.substring(6);
            fullText += eventData;
          }
        }
      }
      
      return {
        content: [
          {
            type: "text",
            text: fullText || "No se recibió respuesta del servidor."
          }
        ],
        question: message,
        fileId: fileId
      };
      
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error en el proceso: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  'lar-upload-document',
  'Tool to upload a document from a URL to Legal Assistant RAG.',
  {
    name: z.string().describe('The name to assign to the document.'),
    url: z.string().url().describe('The URL of the document to upload.'),
  },
  async ({ name, url }) => {
    try {
      const response = await fetch(url);
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.toLowerCase().includes('pdf')) {
        return {
          content: [
            {
              type: "text",
              text: "Solo se permiten archivos PDF. El archivo descargado no tiene tipo PDF.",
            }
          ]
        };
      }
      const arrayBuffer = await response.arrayBuffer();

      // "magic number" del PDF
      const fileStart = Buffer.from(arrayBuffer).subarray(0, 5).toString();
      if (fileStart !== '%PDF-') {
        return {
          content: [
            {
              type: "text",
              text: "Solo se permiten archivos PDF. El archivo descargado no es un PDF válido.",
            }
          ]
        };
      }

      const fileBlob = new Blob([arrayBuffer], { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('Name', name);
      formData.append('File', fileBlob, name);
      formData.append('ScrapedAt', new Date().toISOString());

      const apiUrl = process.env.API_URL
        ? `${process.env.API_URL}/api/files`
        : "http://localhost:3000/api/files";
      const tokenJWT = await loginAPI();

      const uploadResponse = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
        headers: { "Authorization": `Bearer ${tokenJWT}` },
      });

      const text = await uploadResponse.text();
      if (!uploadResponse.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Error al subir el documento: ${uploadResponse.status} - ${text}`,
            }
          ]
        };
      }

      let result: any = {};
      try {
        result = JSON.parse(text);
      } catch {
        result = { raw: text };
      }

      return {
        content: [
          {
            type: "text",
            text: `Documento subido correctamente. ID: ${result.Id || result.id || "desconocido"}`,
          }
        ],
        apiResponse: result
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error en el proceso: ${error.message}`,
          }
        ]
      };
    }
  }
);

server.tool(
  'lar-delete-document',
  'Tool to delete a document from the Legal Assistant RAG system.',
  {
    name: z.string().describe('The name of the document to delete.'),
  },
  async ({ name }) => {
    try {

      const tokenJWT = await loginAPI();
      const apiUrl = process.env.API_URL
        ? `${process.env.API_URL}/api/files/${encodeURIComponent(name)}`
        : `http://localhost:3000/api/files/${encodeURIComponent(name)}`;
      
      const response = await fetch(apiUrl, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${tokenJWT}`,
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 404) {
          return {
            content: [
              {
                type: "text",
                text: `No se encontró ningún documento con el nombre "${name}".`
              }
            ]
          };
        }
        
        return {
          content: [
            {
              type: "text",
              text: `Error al eliminar el documento: ${response.status} - ${errorText}`
            }
          ]
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Documento "${name}" eliminado correctamente.`
          }
        ]
      };
      
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error en el proceso: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  'lar-list-documents',
  'Tool to list all available documents in Legal Assistant RAG.',
  {},
  async () => {
    try {

      const tokenJWT = await loginAPI();
      const apiUrl = process.env.API_URL
        ? `${process.env.API_URL}/api/files`
        : "http://localhost:3000/api/files";

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${tokenJWT}`,
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [
            {
              type: "text",
              text: `Error al obtener los documentos: ${response.status} - ${errorText}`
            }
          ]
        };
      }

      const documents = await response.json();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(documents, null, 2)
          }
        ],
        documents
      };

    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error al obtener los documentos: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  'lar-list-clients',
  'Tool to list all available clients in Legal Assistant RAG.',
  {},
  async () => {
    try {

      const tokenJWT = await loginAPI();
      const apiUrl = process.env.API_URL
        ? `${process.env.API_URL}/api/clients/user`
        : "http://localhost:3000/api/clients/user";

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${tokenJWT}`,
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [
            {
              type: "text",
              text: `Error al obtener los clientes: ${response.status} - ${errorText}`
            }
          ]
        };
      }

      const clients = await response.json();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(clients, null, 2)
          }
        ],
        clients
      };

    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error al obtener los clientes: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  'lar-create-client',
  'Tool to create a new client in the Legal Assistant RAG system.',
  {
    name: z.string().describe('The name of the client.'),
    contactInformation: z.string().describe('Contact information for the client (phone, email, etc.).'),
    address: z.string().optional().describe('The address of the client (optional).'),
    notes: z.string().optional().describe('Additional notes about the client (optional).'),
  },
  async ({ name, contactInformation, address, notes }) => {
    try {
      const tokenJWT = await loginAPI();
      
      const idUser = await getUserId();
      
      const apiUrl = process.env.API_URL
        ? `${process.env.API_URL}/api/clients`
        : "http://localhost:3000/api/clients";
      
      const clientData: Record<string, any> = {
        idUser: idUser,
        name: name,
        contactInformation: contactInformation,
      };
      
      if (address) clientData.address = address;
      if (notes) clientData.notes = notes;
      
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenJWT}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(clientData)
      });
      
      const text = await response.text();
      let result;
      
      try {
        result = JSON.parse(text);
      } catch {
        result = { raw: text };
      }
      
      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Error al crear el cliente: ${response.status} - ${text}`
            }
          ]
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Cliente creado correctamente.}`
          }
        ],
        client: result
      };
      
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error en el proceso: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  'lar-delete-client',
  'Tool to delete a client from the system.',
  {
    clientId: z.number().int().positive().describe('The ID of the client to delete.'),
  },
  async ({ clientId }) => {
    try {
      const tokenJWT = await loginAPI();
      
      const apiUrl = process.env.API_URL
        ? `${process.env.API_URL}/api/clients/${clientId}`
        : `http://localhost:3000/api/clients/${clientId}`;
      
      const response = await fetch(apiUrl, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${tokenJWT}`,
          "Accept": "application/json"
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 400 && errorText.includes("associated cases")) {
          return {
            content: [
              {
                type: "text",
                text: `No se puede eliminar el cliente porque tiene casos asociados. Por favor, elimine primero los casos o reasígnelos a otro cliente.`
              }
            ]
          };
        }
        
        return {
          content: [
            {
              type: "text",
              text: `Error al eliminar el cliente: ${response.status} - ${errorText}`
            }
          ]
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Cliente con ID ${clientId} eliminado correctamente.`
          }
        ]
      };
      
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error en el proceso: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  'lar-edit-client',
  'Tool to edit an existing client in the system.',
  {
    clientId: z.number().int().positive().describe('The ID of the client to edit.'),
    name: z.string().optional().describe('The new name of the client.'),
    contactInformation: z.string().optional().describe('New contact information for the client (phone, email, etc.).'),
    address: z.string().optional().describe('New address of the client.'),
    notes: z.string().optional().describe('New additional notes about the client.'),
  },
  async ({ clientId, name, contactInformation, address, notes }) => {
    try {
      const tokenJWT = await loginAPI();
      
      const apiUrl = process.env.API_URL
        ? `${process.env.API_URL}/api/clients/${clientId}`
        : `http://localhost:3000/api/clients/${clientId}`;
      
      const getResponse = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${tokenJWT}`,
          "Accept": "application/json"
        }
      });
      
      if (!getResponse.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Error al obtener el cliente para editar: ${getResponse.status} - ${await getResponse.text()}`
            }
          ]
        };
      }
      
      const currentClient = await getResponse.json();
      
      const idUser = await getUserId();
      
      const updatedClientData: Record<string, any> = {
        idUser: idUser,
        name: name !== undefined ? name : currentClient.name,
        contactInformation: contactInformation !== undefined ? contactInformation : currentClient.contactInformation
      };
      
      if (address !== undefined) {
        updatedClientData.address = address;
      } else if (currentClient.address) {
        updatedClientData.address = currentClient.address;
      }
      
      if (notes !== undefined) {
        updatedClientData.notes = notes;
      } else if (currentClient.notes) {
        updatedClientData.notes = currentClient.notes;
      }
      
      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${tokenJWT}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(updatedClientData)
      });
      
      const text = await response.text();
      let result;
      
      try {
        result = JSON.parse(text);
      } catch {
        result = { raw: text };
      }
      
      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Error al actualizar el cliente: ${response.status} - ${text}`
            }
          ]
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Cliente con ID ${clientId} actualizado correctamente.`
          }
        ],
        client: result
      };
      
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error en el proceso: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  'lar-list-cases',
  'Tool to list all cases in the Legal Assistant RAG system.',
  {},
  async () => {
    try {
      const tokenJWT = await loginAPI();
   
      const apiUrl = process.env.API_URL
        ? `${process.env.API_URL}/api/cases`
        : "http://localhost:3000/api/cases";
      
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${tokenJWT}`,
          "Accept": "application/json"
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [
            {
              type: "text",
              text: `Error al obtener los casos: ${response.status} - ${errorText}`
            }
          ]
        };
      }
      
      const cases = await response.json();
      
      if (!Array.isArray(cases) || cases.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No hay casos disponibles en el sistema."
            }
          ]
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(cases, null, 2)
          }
        ],
        cases 
      };
      
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error al obtener los casos: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  'lar-create-case',
  'Tool to create a new legal case in the system.',
  {
    title: z.string().describe('The title of the case.'),
    description: z.string().optional().describe('Description of the case (optional).'),
    status: z.enum(['Open', 'Closed', 'Pending']).default('Open').describe('Status of the case (Open, Closed, or Pending).'),
    courtDate: z.string().optional().describe('Court date in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS±HH:MM) if applicable.'),
    clientId: z.number().int().positive().describe('The ID of the client associated with this case.'),
  },
  async ({ title, description, status, courtDate, clientId }) => {
    try {
      const tokenJWT = await loginAPI();
      
      const assignedUserId = await getUserId();
      
      const apiUrl = process.env.API_URL
        ? `${process.env.API_URL}/api/cases`
        : "http://localhost:3000/api/cases";
      
      const caseData: Record<string, any> = {
        title: title,
        assignedUserId: assignedUserId,
        clientId: clientId,
        status: status
      };
      
      if (description) caseData.description = description;
      
      if (courtDate) {
        const date = new Date(courtDate);
        if (isNaN(date.getTime())) {
          return {
            content: [
              {
                type: "text",
                text: `Formato de fecha inválido. Por favor, usa el formato YYYY-MM-DD o YYYY-MM-DDTHH:MM:SS±HH:MM.`
              }
            ]
          };
        }
        caseData.courtDate = date.toISOString();
      }
      
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenJWT}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(caseData)
      });
      
      const text = await response.text();
      let result;
      
      try {
        result = JSON.parse(text);
      } catch {
        result = { raw: text };
      }
      
      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Error al crear el caso: ${response.status} - ${text}`
            }
          ]
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Caso creado correctamente.`
          }
        ],
        case: result
      };
      
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error en el proceso: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  'lar-delete-case',
  'Tool to delete a legal case from the system.',
  {
    caseId: z.number().int().positive().describe('The ID of the case to delete.'),
  },
  async ({ caseId }) => {
    try {
      const tokenJWT = await loginAPI();
      
      const apiUrl = process.env.API_URL
        ? `${process.env.API_URL}/api/cases/${caseId}`
        : `http://localhost:3000/api/cases/${caseId}`;
      
      const response = await fetch(apiUrl, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${tokenJWT}`,
          "Accept": "application/json"
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [
            {
              type: "text",
              text: `Error al eliminar el caso: ${response.status} - ${errorText}`
            }
          ]
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Caso con ID ${caseId} eliminado correctamente.`
          }
        ]
      };
      
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error en el proceso: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  'lar-edit-case',
  'Tool to edit an existing legal case in the system.',
  {
    caseId: z.number().int().positive().describe('The ID of the case to edit.'),
    title: z.string().optional().describe('The new title of the case.'),
    description: z.string().optional().describe('New description of the case.'),
    status: z.enum(['Open', 'Closed', 'Pending']).optional().describe('New status of the case (Open, Closed, or Pending).'),
    courtDate: z.string().optional().describe('New court date in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS±HH:MM).'),
    clientId: z.number().int().positive().optional().describe('The ID of the client to associate with this case.'),
    assignedUserId: z.number().int().positive().optional().describe('The ID of the user to assign to this case (leave empty to assign to current user).'),
  },
  async ({ caseId, title, description, status, courtDate, clientId, assignedUserId }) => {
    try {
      const tokenJWT = await loginAPI();

      const apiUrl = process.env.API_URL
        ? `${process.env.API_URL}/api/cases/${caseId}`
        : `http://localhost:3000/api/cases/${caseId}`;
      
      const getResponse = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${tokenJWT}`,
          "Accept": "application/json"
        }
      });
      
      if (!getResponse.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Error al obtener el caso para editar: ${getResponse.status} - ${await getResponse.text()}`
            }
          ]
        };
      }
      
      const currentCase = await getResponse.json();
      
      const updatedCaseData: Record<string, any> = {
        title: title || currentCase.title,
        description: description !== undefined ? description : currentCase.description,
        status: status || currentCase.status,
        clientId: clientId || currentCase.clientId,
        assignedUserId: assignedUserId || (await getUserId())
      };
      
      if (courtDate) {
        const date = new Date(courtDate);
        if (isNaN(date.getTime())) {
          return {
            content: [
              {
                type: "text",
                text: `Formato de fecha inválido. Por favor, usa el formato YYYY-MM-DD o YYYY-MM-DDTHH:MM:SS±HH:MM.`
              }
            ]
          };
        }
        updatedCaseData.courtDate = date.toISOString();
      } else if (currentCase.courtDate) {
        updatedCaseData.courtDate = currentCase.courtDate;
      }
      
      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${tokenJWT}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(updatedCaseData)
      });
      
      const text = await response.text();
      let result;
      
      try {
        result = JSON.parse(text);
      } catch {
        result = { raw: text };
      }
      
      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Error al actualizar el caso: ${response.status} - ${text}`
            }
          ]
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Caso con ID ${caseId} actualizado correctamente.`
          }
        ],
        case: result
      };
      
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error en el proceso: ${error.message}`
          }
        ]
      };
    }
  }
);



async function startServer() {
  if (transportMode === "stdio") {

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("MCP Server running in stdio mode.");
  } else if (transportMode === "http") {

    const app = express();
    app.use(express.json());

    app.post('/mcp', async (req, res) => {
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        res.on('close', () => {
          transport.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: req.body && req.body.id ? req.body.id : null
          });
        }
      }
    });

    const PORT = 8080;
    app.listen(PORT, () => {
      console.log(`MCP Server HTTP listening on port ${PORT}/mcp`);
    });
  } else {
    throw new Error(`Unknown MCP_TRANSPORT mode: ${transportMode}`);
  }
}

startServer().catch(err => {
  console.error("Error starting MCP server:", err);
  process.exit(1);
});
