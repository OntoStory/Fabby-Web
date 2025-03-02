let audioContext, mediaRecorder, websocket, signedUrl;
let isWebSocketConnected = false;
let isSpeaking = false;
let lastSpeechTime = 0;
let speechStartTime = 0;
const ENERGY_THRESHOLD = 0.1;
const SILENCE_DURATION_THRESHOLD = 1000; // ms
const MIN_SPEECH_DURATION = 500; // ms
const SAMPLE_RATE = 16000;
const CHUNK_SIZE = 4096;
let unityInstance = null;
const greetings = [
"Hey! Bist du bereit, zu entdecken, wie Natur und Technologie gemeinsam eine abfallfreie Zukunft schaffen?",

"Willkommen! Lass uns alltägliche Entscheidungen in kraftvolle Schritte zur Kreislaufwirtschaft verwandeln. Wo sollen wir anfangen?",

"Schön, dich zu sehen! Hast du dich jemals gefragt, wie eine kleine Änderung eine große Wirkung haben kann? Lass es uns gemeinsam herausfinden!",

"Hallo, mein Freund! Nachhaltigkeit ist nicht nur eine Idee – es ist ein Abenteuer. Willst du den ersten Schritt machen?",

"Freut mich, dich kennenzulernen! Was wäre, wenn es keinen Müll gäbe? Lass uns Ressourcen neu denken und klügere Lösungen schaffen!",

"Schön, dass du hier bist! Ich liebe es, Nachhaltigkeit einfach und unterhaltsam zu machen. Frag mich alles!",

"Hey! Wusstest du, dass kleine kreislaufwirtschaftliche Gewohnheiten ganze Systeme verändern können? Lass uns heute mit einer beginnen!",

"Willkommen an Bord! Gemeinsam können wir Abfall in Möglichkeiten verwandeln. Was geht dir durch den Kopf?",

"Hallo! Stell dir eine Welt vor, in der alles wiederverwendet oder umfunktioniert wird. Lass uns sie gemeinsam erschaffen!",

"Du hast es geschafft! Nachhaltigkeit bedeutet Gleichgewicht – zwischen Natur, Menschen und Fortschritt. Wie kann ich heute helfen?"
];

// Step 2: Connect to WebSocket
function connectWebSocket() {
    console.log("Connecting to WebSocket with URL:", signedUrl);

    if (!signedUrl) {
        console.error("Error: Signed URL is missing!");
        return;
    }

    try {
        websocket = new WebSocket(signedUrl);

        websocket.onopen = () => {
            console.log(" WebSocket Connected!");
            isWebSocketConnected = true;
            sendAuthMessage(); // Step 3: Send authentication message
        };

        websocket.onmessage = (event) => {
         handleWebSocketMessage(event.data);
            console.log(" Message received");
        };

        websocket.onerror = (error) => {
            console.error(" WebSocket error:", error);
        };

        websocket.onclose = (event) => {
            console.warn("⚠️ WebSocket closed:", event);
        };
    } catch (error) {
        console.error("Failed to connect WebSocket:", error);
    }
}
// Step 1: Get Signed URL
function GetSignedUrl(apiKey, agentId) {
    console.log("Unity called GetSignedUrl()");
    getSignedUrl(apiKey, agentId); // Calls the function that gets the signed URL
}

async function getSignedUrl(apiKey, agentId) {
    console.log("Fetching signed URL...");
    try {
        let response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`, {
            headers: { "xi-api-key": apiKey }
        });
        let data = await response.json();
        if (data.signed_url) {
            signedUrl = data.signed_url;
            console.log("Signed URL received:", signedUrl);
            connectWebSocket(); // Step 2: Connect to WebSocket
        } else {
            throw new Error("Failed to retrieve signed URL.");
        }
    } catch (error) {
        console.error("Error fetching signed URL:", error);
    }
}


// Step 3: Send Authentication Message
function sendAuthMessage() {
    if (!isWebSocketConnected) {
        console.warn("WebSocket not connected. Cannot send auth message.");
        return;
    }

    let authMessage = JSON.stringify({
        type: "conversation_initiation_client_data",
        conversation_config_override: { agent: { first_message: getRandomGreeting(greetings) } }
    });

    websocket.send(authMessage);
    console.log("Authentication message sent.");

    startMicrophone(); // Step 4: Start microphone after WebSocket connection
}

// Step 4: Start Microphone
async function startMicrophone() {
    console.log("Requesting microphone access...");
    try {
        let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
        let source = audioContext.createMediaStreamSource(stream);
        let processor = audioContext.createScriptProcessor(CHUNK_SIZE, 1, 1);

        source.connect(processor);
        processor.connect(audioContext.destination);

        processor.onaudioprocess = (event) => processAudioChunk(event.inputBuffer.getChannelData(0));

        console.log("Microphone started successfully.");
    } catch (error) {
        console.error("Microphone access denied:", error);
    }
}

// Step 5: Process Audio and Detect Speech
function processAudioChunk(audioData) {
    let hasVoice = detectVoiceActivity(audioData);

    if (hasVoice) {
        if (!isSpeaking) {
            isSpeaking = true;
            speechStartTime = Date.now();
            sendToUnity("OnSpeechStarted");
        }
        lastSpeechTime = Date.now();
    } else if (isSpeaking) {
        let silenceDuration = Date.now() - lastSpeechTime;
        if (silenceDuration >= SILENCE_DURATION_THRESHOLD) {
            let speechDuration = lastSpeechTime - speechStartTime;
            if (speechDuration >= MIN_SPEECH_DURATION) {
                sendToUnity("OnSpeechEnded");
            }
            isSpeaking = false;
        }
    }

    let pcmData = convertFloatToPCM(audioData);
    let base64Audio = btoa(String.fromCharCode(...pcmData));

    if (isWebSocketConnected) {
        websocket.send(JSON.stringify({ user_audio_chunk: base64Audio }));
    } else {
        console.warn("WebSocket not connected. Cannot send audio data.");
    }
}

// Step 6: Voice Activity Detection (RMS Energy)
function detectVoiceActivity(audioChunk) {
    let sumSquares = 0;
    for (let sample of audioChunk) {
        sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / audioChunk.length) > ENERGY_THRESHOLD;
}

// Step 7: Convert Audio to PCM Format
function convertFloatToPCM(floatArray) {
    let pcmData = new Uint8Array(floatArray.length * 2);
    for (let i = 0; i < floatArray.length; i++) {
        let sample = Math.max(-1, Math.min(1, floatArray[i]));
        let shortSample = sample * 32767;
        pcmData[i * 2] = shortSample & 0xff;
        pcmData[i * 2 + 1] = (shortSample >> 8) & 0xff;
    }
    return pcmData;
}

// Step 8: Handle WebSocket Messages & Forward to Unity
function handleWebSocketMessage(data) {
    try {
        let response = JSON.parse(data);
        console.log("Parsed WebSocket message:", response);  // Debug log

        // Check if Unity instance exists
        if (!window.unityInstance) {
            console.error("Unity instance not found when handling WebSocket message");
            return;
        }

        switch(response.type) {
            case "audio":
                if (response.audio_event && response.audio_event.audio_base_64) {
                    console.log("Sending audio to Unity...");
                    window.unityInstance.SendMessage("ClaireCall", "OnAudioReceived", 
                        response.audio_event.audio_base_64);
                }
                break;

                case "agent_response":
                    if (response.agent_response_event && response.agent_response_event.agent_response) {
                        console.log("Sending agent response:", response.agent_response_event.agent_response);
                        window.unityInstance.SendMessage("ClaireCall", "OnAgentResponse", 
                            response.agent_response_event.agent_response);
                    }
                    break;
    
                case "user_transcript":
                    if (response.user_transcription_event && response.user_transcription_event.user_transcript) {
                        console.log("Sending transcript:", response.user_transcription_event.user_transcript);
                        window.unityInstance.SendMessage("ClaireCall", "OnUserTranscript", 
                            response.user_transcription_event.user_transcript);
                    }
                    break;

            case "client_tool_call":
                if (response.client_tool_call) {
                    console.log("Sending tool call to Unity...");
                    window.unityInstance.SendMessage("ClaireCall", "OnClientToolCall", 
                        JSON.stringify(response.client_tool_call));
                }
                break;

            default:
                console.log("Unknown message type:", response.type);
        }
    } catch (error) {
        console.error("Error handling WebSocket message:", error);
        console.error("Raw message data:", data);
    }
}

// Step 9: Send Messages to Unity
function sendToUnity(eventName, data = "") {
    if (unityInstance) {
        try {
            unityInstance.SendMessage("ClaireCall", eventName, data.toString());
            console.log(`Sent to Unity - Event: ${eventName}, Data:`, data);
        } catch (error) {
            console.error("Error sending message to Unity:", error, "Event:", eventName, "Data:", data);
        }
    } else {
        console.warn("Unity instance not initialized yet. Message queued:", eventName);
        // Optionally, you could queue messages here to send once Unity is initialized
    }
}
function initializeUnityConnection(instance) {
    console.log("Unity instance received:", instance);
    unityInstance = instance;
    window.unityInstance = instance;  // Also store it globally just in case
}
function getRandomGreeting(greetings) {
    const randomIndex = Math.floor(Math.random() * greetings.length);
    return greetings[randomIndex];
}