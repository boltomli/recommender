const fetch = require('node-fetch');

async function testLLM() {
  try {
    const response = await fetch('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'zai-org/glm-4.6v-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant.'
          },
          {
            role: 'user',
            content: 'Say "Hello, LLM is working!"'
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('LLM Response:', JSON.stringify(data, null, 2));
    console.log('\nLLM is working!');
  } catch (error) {
    console.error('Error testing LLM:', error);
  }
}

testLLM();