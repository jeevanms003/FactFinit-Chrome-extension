import express, { Express } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import verifyRouter from './routes/verify';
import errorHandler from './middleware/errorHandler';

dotenv.config();

const app: Express = express();

// Validate environment variables
const requiredEnvVars = ['PORT', 'MONGODB_URI', 'GEMINI_API_KEY', 'RAG_API_URL'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`Error: Missing environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI!)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Middleware
app.use(cors({ origin: ['*'] }));
app.use(express.json());

// Routes
app.get('/health', (req, res) => res.status(200).json({ status: 'OK', message: 'Server is running' }));
app.use('/api/verify', verifyRouter);

// Error handling
app.use(errorHandler);

// Start server
const PORT: number = parseInt(process.env.PORT || '5000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});