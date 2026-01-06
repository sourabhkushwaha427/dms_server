-- =============================================
-- DMS FULL DATABASE SCRIPT (Friday Demo Ready)
-- =============================================

-- 1. Setup Extensions (UUID generation)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Generic Function: Updated_at timestamp ko auto-handle karne ke liye
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 3. Roles Table (Access Control)
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_name VARCHAR(50) UNIQUE NOT NULL, -- 'Admin', 'Staff', 'Public'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID REFERENCES roles(id),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Categories Table (Hierarchical Folders)
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    parent_id UUID REFERENCES categories(id), -- Sub-folders ke liye
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Documents Table (Main Info)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'published', -- 'published', 'draft', 'archived'
    current_version_num INT DEFAULT 1,
    metadata JSONB, -- Tags/Keywords ke liye
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Document Versions Table (Version Control)
CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    file_path TEXT NOT NULL, -- Storage link
    file_type VARCHAR(10), -- 'pdf', 'docx'
    file_size_bytes BIGINT,
    uploaded_by UUID REFERENCES users(id),
    change_log TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_doc_version UNIQUE (document_id, version_number) -- Ek version number ek hi baar
);

-- 8. Audit Logs Table (Tracking/Compliance)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- 'UPLOAD', 'DOWNLOAD', 'VIEW'
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_docs_category ON documents(category_id);
CREATE INDEX IF NOT EXISTS idx_docs_title ON documents(title);
CREATE INDEX IF NOT EXISTS idx_versions_doc ON document_versions(document_id);

-- 10. Triggers for Automatic Timestamps
CREATE TRIGGER set_timestamp_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER set_timestamp_docs BEFORE UPDATE ON documents FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 11. VERSION TRACKER TRIGGER: Jab bhi naya version aaye, main document table update ho jaye
CREATE OR REPLACE FUNCTION update_doc_current_version()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE documents 
    SET current_version_num = NEW.version_number,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.document_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_auto_update_version 
AFTER INSERT ON document_versions 
FOR EACH ROW EXECUTE PROCEDURE update_doc_current_version();

-- 12. SAMPLE DATA (Demo ke liye categories aur roles ready rahein)
INSERT INTO roles (role_name) VALUES ('Admin'), ('Staff'), ('Public') ON CONFLICT DO NOTHING;

INSERT INTO categories (name) VALUES 
('Annual Procurement Plan'), 
('Project Staff Related'), 
('Services Requisition'),
('PPC Forms') 
ON CONFLICT DO NOTHING;

-- =============================================
-- END OF SCRIPT
-- =============================================



ALTER TABLE users
ADD COLUMN reset_token TEXT,
ADD COLUMN reset_token_expiry TIMESTAMP;



ALTER TABLE documents
ADD COLUMN visibility VARCHAR(20) DEFAULT 'staff';


INSERT INTO categories (name) VALUES 
('Director Secretariat'), ('Notice'), ('Annual Report'), ('RTI');









-- 1. Document ka source batane ke liye (Upload kiya hai ya Live banaya hai)
ALTER TABLE documents 
ADD COLUMN doc_source_type VARCHAR(20) DEFAULT 'file'; 
-- Values ho sakti hain: 'file', 'sheet', 'rich_text'

-- 2. Live content (Excel ka data ya Word ka text) save karne ke liye
ALTER TABLE documents 
ADD COLUMN content_data JSONB DEFAULT NULL;











-- 1. Document Versions Table Fix
ALTER TABLE document_versions
DROP CONSTRAINT IF EXISTS document_versions_document_id_fkey;

ALTER TABLE document_versions
ADD CONSTRAINT document_versions_document_id_fkey
FOREIGN KEY (document_id)
REFERENCES documents(id)
ON DELETE CASCADE;  -- <-- YE ZAROORI HAI

-- 2. Audit Logs Table Fix
ALTER TABLE audit_logs
DROP CONSTRAINT IF EXISTS audit_logs_document_id_fkey;

ALTER TABLE audit_logs
ADD CONSTRAINT audit_logs_document_id_fkey
FOREIGN KEY (document_id)
REFERENCES documents(id)
ON DELETE SET NULL; -- Delete hone par log me NULL ho jaye, par error na de




CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL, -- URL ke liye (e.g. "offers")
    content JSONB, -- 🔥 Pura Craft.js ka data yahan jayega
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);