const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Initialize Express app
const app = express();
const port = 3222;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'Uploads');
(async () => {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.chmod(uploadsDir, 0o755); // Secure permissions
    console.log('Uploads directory initialized');
  } catch (error) {
    console.error('Failed to initialize uploads directory:', error);
    process.exit(1);
  }
})();

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60000, // Increased to handle more users
  message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use(limiter);

// Logging
app.use(morgan('dev'));

// CORS configuration
const allowedOrigins = [
  'http://54.166.206.245:8080',
  'http://54.166.206.245:7774',
  'http://54.166.206.245:7775',
  'http://54.166.206.245:7776',
  'http://54.166.206.245:3222',
  'http://localhost',
  'http://localhost:7774',
  'http://localhost:7775',
  'http://localhost:7776',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:7774',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin.toLowerCase()) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Database configuration
const pool = new Pool({
  user: 'postgres',
  host: 'postgres',
  // Change to 'localhost' for local testing
  database: 'new_employee_db_job',
  password: 'admin123',
  access_key_id: 'AKIA2JSQ3A7',
  port: 5432,
});

// Test database connection to to with retry
const connectWithRetry = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT NOW()');
      console.log('Database connection successful');
      return;
    } catch (error) {
      console.error('Database connection attempt ${i + 1} failed:', error.message);
      if (i < retries - 1) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('Failed to connect to database after retries');
  process.exit(1);
};

connectWithRetry();

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const filetypes = /pdf|jpeg|jpg|png/;
  const mimetype = filetypes.test(file.mimetype);
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, JPEG, JPG, and PNG files are allowed'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter,
});

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// Get all applications or filter by status, reference_id, or email
app.get('/api/applications', async (req, res) => {
  try {
    const { status, reference_id, email } = req.query;
    let query = 'SELECT * FROM job_applications WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      values.push(status);
    }
    if (reference_id) {
      query += ` AND reference_id = $${paramIndex++}`;
      values.push(reference_id);
    }
    if (email) {
      query += ` AND email = $${paramIndex++}`;
      values.push(email);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, values);
    console.log(`Fetched ${result.rowCount} applications${status ? ` with status ${status}` : ''}${reference_id ? ` with reference_id ${reference_id}` : ''}${email ? ` with email ${email}` : ''}`);

    res.status(200).json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch applications',
      details: error.message,
    });
  }
});

// Get single application by ID
app.get('/api/applications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM job_applications WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Application not found',
      });
    } else {
      console.log(`Fetched application ID ${id}: reference_id=${result.rows[0].reference_id}`);
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error(`Error fetching application ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch application',
      details: error.message,
    });
  }
});

// Submit job application
app.post(
  '/api/applications',
  upload.fields([
    { name: 'sscDoc', maxCount: 1 },
    { name: 'intermediateDoc', maxCount: 1 },
    { name: 'graduationDoc', maxCount: 1 },
    { name: 'additionalFiles', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const requiredFields = ['full_name', 'email', 'mobile_number', 'department', 'job_role'];
      const missingFields = requiredFields.filter(field => !req.body[field]);

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          missing: missingFields,
        });
      }

      const reference_id = `REF${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const query = `
        INSERT INTO job_applications (
          reference_id, full_name, email, mobile_number, department, job_role,
          dob, father_name, permanent_address, expected_salary, interview_date,
          joining_date, employment_type, branch_location, ssc_year, ssc_percentage,
          intermediate_year, intermediate_percentage, college_name, register_number,
          graduation_year, graduation_percentage, additional_certifications,
          experience_status, years_of_experience, previous_company, previous_job_role,
          ssc_doc_path, intermediate_doc_path, graduation_doc_path, additional_files_path, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, 'Pending')
        RETURNING id, reference_id
      `;

      const values = [
        reference_id,
        req.body.full_name,
        req.body.email,
        req.body.mobile_number,
        req.body.department,
        req.body.job_role,
        req.body.dob || null,
        req.body.father_name || null,
        req.body.permanent_address || null,
        req.body.expected_salary || null,
        req.body.interview_date || null,
        req.body.joining_date || null,
        req.body.employment_type || null,
        req.body.branch_location || null,
        req.body.ssc_year || null,
        req.body.ssc_percentage || null,
        req.body.intermediate_year || null,
        req.body.intermediate_percentage || null,
        req.body.college_name || null,
        req.body.register_number || null,
        req.body.graduation_year || null,
        req.body.graduation_percentage || null,
        req.body.additional_certifications || null,
        req.body.experience_status || 'No',
        req.body.years_of_experience || null,
        req.body.previous_company || null,
        req.body.previous_job_role || null,
        req.files['sscDoc'] ? path.basename(req.files['sscDoc'][0].path) : null,
        req.files['intermediateDoc'] ? path.basename(req.files['intermediateDoc'][0].path) : null,
        req.files['graduationDoc'] ? path.basename(req.files['graduationDoc'][0].path) : null,
        req.files['additionalFiles'] ? path.basename(req.files['additionalFiles'][0].path) : null,
      ];

      const result = await pool.query(query, values);
      console.log(`Application submitted: ID=${result.rows[0].id}, reference_id=${result.rows[0].reference_id}`);

      res.status(201).json({
        success: true,
        message: 'Application submitted successfully',
        reference_id: result.rows[0].reference_id,
      });
    } catch (error) {
      console.error('Application submission error:', error);
      if (error.code === '23505') { // PostgreSQL unique violation
        const detail = error.detail || '';
        if (detail.includes('email')) {
          return res.status(400).json({
            success: false,
            error: 'Email already exists',
          });
        } else if (detail.includes('mobile_number')) {
          return res.status(400).json({
            success: false,
            error: 'Mobile number already exists',
          });
        } else if (detail.includes('reference_id')) {
          return res.status(400).json({
            success: false,
            error: 'Reference ID conflict, please try again',
          });
        }
      }
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message,
      });
    }
  }
);

// Update application status
app.put('/api/applications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status value',
      });
    }

    const result = await pool.query(
      'UPDATE job_applications SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Application not found',
      });
    }

    console.log(`Updated application ID ${id} to status ${status}`);

    res.status(200).json({
      success: true,
      message: 'Status updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error(`Status update error for application ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update status',
      details: error.message,
    });
  }
});

// Upload offer letter
app.post(
  '/api/applications/:id/offer-letter',
  upload.single('offerLetter'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
        });
      }

      const { id } = req.params;
      const offerLetterPath = path.basename(req.file.path);

      const result = await pool.query(
        'UPDATE job_applications SET offer_letter_path = $1 WHERE id = $2 RETURNING *',
        [offerLetterPath, id]
      );

      if (result.rowCount === 0) {
        await fs.unlink(req.file.path).catch(err => console.error('Failed to delete file:', err));
        return res.status(404).json({
          success: false,
          error: 'Application not found',
        });
      }

      console.log(`Uploaded offer letter for application ID ${id}: ${offerLetterPath}`);

      res.status(200).json({
        success: true,
        message: 'Offer letter uploaded successfully',
        filePath: `/Uploads/${offerLetterPath}`,
      });
    } catch (error) {
      console.error(`Offer letter upload error for application ${req.params.id}:`, error);
      if (req.file) {
        await fs.unlink(req.file.path).catch(err => console.error('Failed to delete file:', err));
      }
      res.status(500).json({
        success: false,
        error: 'Failed to upload offer letter',
        details: error.message,
      });
    }
  }
);

// Serve static files
app.use('/Uploads', express.static(uploadsDir));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: 'File upload error',
      message: err.message,
    });
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'CORS policy violation',
      message: 'Request not allowed from this origin',
    });
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Start server
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    pool.end();
    console.log('Server closed. Database connection pool ended');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully');
  server.close(() => {
    pool.end();
    console.log('Server closed. Database connection pool ended');
    process.exit(0);
  });
});

module.exports = app;