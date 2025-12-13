const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5001; // Different port to avoid conflicts

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    console.log('Root endpoint hit');
    res.send('Test server running');
});

app.get('/test', (req, res) => {
    console.log('Test endpoint hit');
    res.json({ message: 'Test successful' });
});

app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);
});
