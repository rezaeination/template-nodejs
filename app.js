const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const { PassThrough } = require('stream');


const app = express();
app.use(cors()); // Enable CORS
app.use(express.json());
const server = app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

// Store shared WebSocket connections by ID
const sharedConnections = {};

// Handle WebSocket connections
function handleWebSocketConnection(ws, req) {
  const uniqueID = req.url.substring(1);
  console.log('New connection:', uniqueID);

  // Check if a shared WebSocket connection already exists for the ID
  if (sharedConnections[uniqueID]) {
    console.log(`Using existing shared WebSocket connection for ID: ${uniqueID}`);
    // Add the new client to the shared WebSocket connection
    sharedConnections[uniqueID].add(ws);
  } else {
    console.log(`Creating new shared WebSocket connection for ID: ${uniqueID}`);
    // Create a new shared WebSocket connection for the ID
    sharedConnections[uniqueID] = new Set([ws]);
  }

  // Listen for messages from the client
  ws.on('message', (message) => {
    console.log(`Received message from ${uniqueID}: ${message}`);
    if (message == 'ping') {
      sharedConnections[uniqueID].forEach((ws) => {
        ws.send('pong'); // Notify the WebSocket connection that the stream has ended
      });
    }
  });

  // Remove the client from the shared WebSocket connection when it closes
  ws.on('close', (code, reason) => {
    console.log(`Connection closed for ${uniqueID} with code: ${code}, reason: ${reason}`);
    console.log(`Connection closed for ${uniqueID}`);
    if (sharedConnections[uniqueID]) {
      sharedConnections[uniqueID].delete(ws);
      if (sharedConnections[uniqueID].size === 0) {
        delete sharedConnections[uniqueID];
        console.log(`Shared WebSocket connection closed for ID: ${uniqueID}`);
      }
    }
  });
}

// Create a new WebSocket server
const wss = new WebSocket.Server({ server });
wss.on('connection', handleWebSocketConnection);

  const API_URL = 'https://api.openai.com/v1/chat/completions';
  const API_KEY = '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'; // Replace with your actual OpenAI API key
  
// WebSocket endpoint to receive generated text from OpenAI

app.delete('/delete/:id', (req, res) => {
  const uniqueID = req.params.id;

  // Check if a shared WebSocket connection exists for the ID
  if (sharedConnections[uniqueID]) {
    // Close all WebSocket connections associated with the ID
    sharedConnections[uniqueID].forEach((ws) => {
      ws.close();
    });

    // Remove the shared WebSocket connection from the list
    delete sharedConnections[uniqueID];

    console.log(`Shared WebSocket connection with ID: ${uniqueID} has been deleted`);
    res.sendStatus(200);
  } else {
    console.log(`No WebSocket connection found with ID: ${uniqueID}`);
    res.sendStatus(404);
  }
});

app.post('/close/:id', (req, res) => {
  const uniqueID = req.params.id;

  // Check if a shared WebSocket connection exists for the ID
  if (sharedConnections[uniqueID]) {
    // Close all WebSocket connections associated with the ID
    sharedConnections[uniqueID].forEach((ws) => {
      ws.send('ENDED-STOPPED');
    });

    // Remove the shared WebSocket connection from the list
    delete sharedConnections[uniqueID];

    console.log(`Shared WebSocket connection with ID: ${uniqueID} has been deleted`);
    res.sendStatus(200);
  } else {
    console.log(`No WebSocket connection found with ID: ${uniqueID}`);
    res.sendStatus(404);
  }
});

app.post('/generate/:id', async (req, res) => {
  const uniqueID = req.params.id;

  // Check if a shared WebSocket connection exists for the ID
  if (sharedConnections[uniqueID]) {
    const prompt = req.body.prompt; // The prompt to generate text
    const api = req.body.api_key;
    const temperature = req.body.temperature;
    const presence_penalty = req.body.presence_penalty;
    const frequency_penalty = req.body.frequency_penalty;
    const max_tokens = req.body.max_tokens;
    const model = req.body.model;

    console.log(prompt);

    sharedConnections[uniqueID].forEach((ws) => {
          
      ws.send('restart'); 
      console.log(prompt);
      const promptfor = prompt[prompt.length - 1];
      const promptdisplay = promptfor.content;
      ws.send(`theprompt: ${promptdisplay}`);
    });
   
    try {
      const stream = await generateText(prompt, api, temperature, presence_penalty, frequency_penalty, max_tokens, model);

      stream.on('data', (chunk) => {
        const chunkData = chunk.toString('utf-8');
        sharedConnections[uniqueID].forEach((ws) => {
          ws.send(chunkData);
        });
      });
    
      stream.on('error', (error) => { 
        console.error('An error occurred during streaming:', error);
        res.sendStatus(403);
      });

      stream.on('end', () => { 
        console.log('Streaming completed');
        res.status(200); // Send the finished text in the response
      
        sharedConnections[uniqueID].forEach((ws) => {
          ws.send('ended'); // Notify the WebSocket connection that the stream has ended
        });
        res.end();
      });
      
    } catch (error) {
      if (error.response && error.response.data && error.response.data.error) {
        console.error('OpenAI API Error:', error.response.data.error);
      } else {
        console.error('An error occurred:', error);
      }
      res.status(200);
    }
  } else {
    console.log(`No WebSocket connection found with ID: ${uniqueID}`);
    res.sendStatus(404);
  }
});
  
  // Function to generate text using OpenAI API
  async function generateText(prompt, api, temperature, presence_penalty, frequency_penalty, max_tokens, model) {
    const stream = new PassThrough();
  
    const requestData = {
      model: model,
      messages: prompt,
      temperature: temperature,
      presence_penalty: presence_penalty,
      frequency_penalty: frequency_penalty,
      stream: true, // Enable SSE streaming
    };
  
    if (max_tokens !== 0) {
      requestData.max_tokens = max_tokens;
    }
  
    const response = await axios.post(
      API_URL,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${api}`,
        },
        responseType: 'stream', // Set response type to stream
      }
    );
  
    response.data.pipe(stream); // Pipe the response stream to the PassThrough stream
  
    return stream;
  }
