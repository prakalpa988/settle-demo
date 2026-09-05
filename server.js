const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public')); // Serves index.html from the public directory

// API endpoint that triggers your agent logic
app.post('/api/run-agent', async (req, res) => {
    try {
        const { valid } = req.body;
        
        // Connect to your existing client agent logic
        const clientAgent = require('./agent/client-agent');
        
        // Execute the agent verification workflow
        const result = await clientAgent.executeWorkflow({ isValidSubmission: valid });
        
        res.json({
            freelancer: result.freelancerName || 'Freelancer-Agent-01',
            escrowTxHash: result.escrowTxHash || '0xEXAMPLE...ESCROW',
            condition: result.condition || 'Crypto-Condition-Hash',
            verificationPassed: result.verificationPassed,
            preimage: result.preimage || 'Secret-Preimage-Key',
            finishTxHash: result.finishTxHash || '0xEXAMPLE...SETTLEMENT'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`SettleAgent server running at http://localhost:${PORT}`);
});