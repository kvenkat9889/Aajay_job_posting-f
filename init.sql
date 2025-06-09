-- Drop existing objects to ensure a clean setup
DROP TABLE IF EXISTS job_applications;
DROP TYPE IF EXISTS application_status;
DROP ROLE IF EXISTS app_user;

-- Create application user with limited privileges
CREATE ROLE app_user WITH LOGIN PASSWORD 'admin123';
GRANT CONNECT ON DATABASE new_employee_db_offer TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- Create status enum type for better data integrity
CREATE TYPE application_status AS ENUM ('Pending', 'Approved', 'Rejected');

-- Create job_applications table with all columns
CREATE TABLE IF NOT EXISTS job_applications (
    id SERIAL PRIMARY KEY,
    reference_id VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    mobile_number VARCHAR(80) NOT NULL UNIQUE,
    department VARCHAR(90) NOT NULL,
    job_role VARCHAR(90) NOT NULL,
    dob DATE,
    father_name VARCHAR(100),
    permanent_address TEXT,
    expected_salary NUMERIC(10, 2),
    interview_date DATE,
    joining_date DATE,
    employment_type VARCHAR(50),
    branch_location VARCHAR(100),
    ssc_year INTEGER,
    ssc_percentage NUMERIC(5, 2),
    intermediate_year INTEGER,
    intermediate_percentage NUMERIC(5, 2),
    college_name VARCHAR(100),
    register_number VARCHAR(50),
    graduation_year INTEGER,
    graduation_percentage NUMERIC(5, 2),
    additional_certifications TEXT,
    experience_status VARCHAR(20) DEFAULT 'No',
    years_of_experience INTEGER,
    previous_company VARCHAR(100),
    previous_job_role VARCHAR(100),
    ssc_doc_path TEXT,
    intermediate_doc_path TEXT,
    graduation_doc_path TEXT,
    additional_files_path TEXT,
    offer_letter_path TEXT,
    status application_status DEFAULT 'Pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_job_applications_status ON job_applications(status);
CREATE INDEX idx_job_applications_email ON job_applications(email);
CREATE INDEX idx_job_applications_reference_id ON job_applications(reference_id);

-- Create trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_job_applications_timestamp
BEFORE UPDATE ON job_applications
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Grant permissions to app_user
GRANT SELECT, INSERT, UPDATE ON job_applications TO app_user;
GRANT USAGE, SELECT ON SEQUENCE job_applications_id_seq TO app_user;

