import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { config } from "dotenv";

config();

const PORT = process.env.PORT || 8787;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";

// System instruction for Piggy Mentor
const SYSTEM_INSTRUCTION = `You are Piggy Mentor, a friendly cartoon pig who helps children learn about saving money and cryptocurrency.
You speak in a warm, patient tone with occasional pig sounds like "oink".
Keep responses short (1-2 sentences), encouraging, and easy for children to understand.
You're optimistic, patient, and soothing. Think of a mix between Winnie the Pooh and Baymax.

You have access to these tools:
- get_crypto_price: Use this when asked about the price of any cryptocurrency
- get_market_overview: Use this when asked about the overall crypto market
- get_wallet_balance: Use this when asked about the user's wallet balance or holdings

Always use the appropriate tool when asked about prices, markets, or wallet balances.`;

// Tools for function calling
const TOOLS = [
  {
    type: "function",
    name: "get_crypto_price",
    description: "Get the current price of a cryptocurrency in USD",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The cryptocurrency symbol (e.g., BTC, ETH, SOL, ARB)",
        },
      },
      required: ["symbol"],
    },
  },
  {
    type: "function",
    name: "get_market_overview",
    description: "Get an overview of the top cryptocurrencies by market cap",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function",
    name: "get_wallet_balance",
    description: "Get the ETH balance and token holdings of the user's connected wallet",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

// Fetch crypto price from CoinGecko API (free, no key required)
async function getCryptoPrice(symbol) {
  const symbolMap = {
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana",
    ARB: "arbitrum",
    MATIC: "matic-network",
    DOGE: "dogecoin",
    XRP: "ripple",
    ADA: "cardano",
    DOT: "polkadot",
    LINK: "chainlink",
  };

  const coinId = symbolMap[symbol.toUpperCase()] || symbol.toLowerCase();

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`
    );
    const data = await res.json();

    if (data[coinId]) {
      return {
        symbol: symbol.toUpperCase(),
        price: data[coinId].usd,
        change_24h: data[coinId].usd_24h_change?.toFixed(2) + "%",
      };
    }
    return { error: `Could not find price for ${symbol}` };
  } catch (err) {
    return { error: "Failed to fetch price data" };
  }
}

// Fetch market overview
async function getMarketOverview() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1"
    );
    const data = await res.json();

    return data.map((coin) => ({
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      price: coin.current_price,
      change_24h: coin.price_change_percentage_24h?.toFixed(2) + "%",
    }));
  } catch (err) {
    return { error: "Failed to fetch market data" };
  }
}

// RPC endpoints for different chains
const RPC_ENDPOINTS = {
  ethereum: "https://eth.llamarpc.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
};

// Fetch wallet balance from RPC
async function getWalletBalance(walletAddress) {
  if (!walletAddress) {
    return { error: "No wallet connected. Please connect your wallet first." };
  }

  try {
    const results = {};

    // Fetch ETH balance on Ethereum mainnet
    const ethRes = await fetch(RPC_ENDPOINTS.ethereum, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [walletAddress, "latest"],
        id: 1,
      }),
    });
    const ethData = await ethRes.json();
    if (ethData.result) {
      const balanceWei = BigInt(ethData.result);
      const balanceEth = Number(balanceWei) / 1e18;
      results.ethereum = {
        chain: "Ethereum",
        balance: balanceEth.toFixed(4) + " ETH",
      };
    }

    // Fetch ETH balance on Arbitrum
    const arbRes = await fetch(RPC_ENDPOINTS.arbitrum, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [walletAddress, "latest"],
        id: 1,
      }),
    });
    const arbData = await arbRes.json();
    if (arbData.result) {
      const balanceWei = BigInt(arbData.result);
      const balanceEth = Number(balanceWei) / 1e18;
      results.arbitrum = {
        chain: "Arbitrum",
        balance: balanceEth.toFixed(4) + " ETH",
      };
    }

    return {
      wallet: walletAddress.slice(0, 6) + "..." + walletAddress.slice(-4),
      balances: Object.values(results),
    };
  } catch (err) {
    console.error("Wallet balance error:", err);
    return { error: "Failed to fetch wallet balance" };
  }
}

// Handle tool calls - walletAddress is passed from session context
async function handleToolCall(name, args, walletAddress) {
  switch (name) {
    case "get_crypto_price":
      return await getCryptoPrice(args.symbol);
    case "get_market_overview":
      return await getMarketOverview();
    case "get_wallet_balance":
      return await getWalletBalance(walletAddress);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }
  res.writeHead(200);
  res.end("OpenAI Voice Gateway");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (clientWs, req) => {
  // Extract wallet address from URL query params
  const url = new URL(req.url, `http://${req.headers.host}`);
  const walletAddress = url.searchParams.get("wallet") || null;

  console.log("Client connected", walletAddress ? `wallet: ${walletAddress}` : "(no wallet)");

  if (!OPENAI_API_KEY) {
    clientWs.send(JSON.stringify({ type: "error", message: "OpenAI API key not configured" }));
    clientWs.close();
    return;
  }

  // Connect to OpenAI Realtime API
  const openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  let isReady = false;

  openaiWs.on("open", () => {
    console.log("Connected to OpenAI Realtime");

    // Send session configuration
    openaiWs.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions: SYSTEM_INSTRUCTION,
        voice: "alloy",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools: TOOLS,
        tool_choice: "auto",
      },
    }));
  });

  openaiWs.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Log message type for debugging
      console.log("OpenAI:", message.type);

      switch (message.type) {
        case "session.created":
        case "session.updated":
          if (!isReady) {
            isReady = true;
            clientWs.send(JSON.stringify({ type: "ready" }));
          }
          break;

        case "response.audio.delta":
          // Forward audio chunk to client as binary
          if (message.delta) {
            const audioBuffer = Buffer.from(message.delta, "base64");
            clientWs.send(audioBuffer);
          }
          break;

        case "response.audio_transcript.delta":
          // Optional: forward transcript
          clientWs.send(JSON.stringify({
            type: "transcript",
            role: "assistant",
            text: message.delta,
          }));
          break;

        case "conversation.item.input_audio_transcription.completed":
          // User's speech transcribed
          clientWs.send(JSON.stringify({
            type: "transcript",
            role: "user",
            text: message.transcript,
          }));
          break;

        case "input_audio_buffer.speech_started":
          // User started speaking - interrupt any ongoing response
          clientWs.send(JSON.stringify({ type: "interrupted" }));
          break;

        case "response.done":
          clientWs.send(JSON.stringify({ type: "turn_complete" }));
          break;

        case "response.function_call_arguments.done":
          // Handle function call
          (async () => {
            const { call_id, name, arguments: argsStr } = message;
            console.log("Function call:", name, argsStr);

            try {
              const args = JSON.parse(argsStr);
              const result = await handleToolCall(name, args, walletAddress);
              console.log("Function result:", result);

              // Send function result back to OpenAI
              openaiWs.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: call_id,
                  output: JSON.stringify(result),
                },
              }));

              // Trigger response generation
              openaiWs.send(JSON.stringify({
                type: "response.create",
              }));
            } catch (err) {
              console.error("Function call error:", err);
            }
          })();
          break;

        case "error":
          console.error("OpenAI error:", message.error);
          clientWs.send(JSON.stringify({
            type: "error",
            message: message.error?.message || "OpenAI error",
          }));
          break;
      }
    } catch (err) {
      console.error("Failed to parse OpenAI message:", err);
    }
  });

  openaiWs.on("close", (code, reason) => {
    console.log("OpenAI connection closed:", code, reason.toString());
    clientWs.close();
  });

  openaiWs.on("error", (err) => {
    console.error("OpenAI WebSocket error:", err);
    clientWs.send(JSON.stringify({ type: "error", message: "OpenAI connection error" }));
    clientWs.close();
  });

  // Handle client messages
  clientWs.on("message", (data) => {
    if (openaiWs.readyState !== WebSocket.OPEN) return;

    // Binary data = audio chunk
    if (Buffer.isBuffer(data)) {
      const base64Audio = data.toString("base64");
      openaiWs.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64Audio,
      }));
      return;
    }

    // Text data = control message
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "stop") {
        openaiWs.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
        openaiWs.close();
      }
    } catch {}
  });

  clientWs.on("close", () => {
    console.log("Client disconnected");
    openaiWs.close();
  });

  clientWs.on("error", (err) => {
    console.error("Client WebSocket error:", err);
    openaiWs.close();
  });
});

server.listen(PORT, () => {
  console.log(`OpenAI Voice Gateway listening on port ${PORT}`);
});
