
async function testConnectivity() {
  console.log("Starting connectivity test to api.groq.com...");
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'GET' });
    console.log("Success! Status:", res.status);
  } catch (err) {
    console.error("Connectivity failure:", err);
  }
}

testConnectivity();
