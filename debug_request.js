const axios = require('axios');

async function debugBackend() {
    try {
        console.log('Testing GET http://localhost:5000/api/reports...');
        const response = await axios.get('http://localhost:5000/api/reports');
        console.log('Success! Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        if (error.response) {
            console.log('Error Status:', error.response.status);
            console.log('Error Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

debugBackend();
