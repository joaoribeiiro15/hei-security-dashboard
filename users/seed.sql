-- =============================================================================
-- HEI Security Dashboard — User Database
-- =============================================================================
-- Drop and recreate the database cleanly on each seed run.
-- This file is mounted into the MySQL container and executed automatically
-- on first start (docker-entrypoint-initdb.d).
--
-- Columns:
--   username     — login name (typically an institutional email)
--   password     — bcrypt hash (use `htpasswd -bnBC 12 "" <pass> | tr -d ':'`)
--                  For plain-text passwords during development set
--                  password_plain and leave password_hash NULL (see server.py).
--   role         — 'global' or 'regional'
--   country      — ISO 3166-1 alpha-2 lowercase (e.g. 'no'), NULL for global
--   display_name — shown in the dashboard UI
-- =============================================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

CREATE DATABASE IF NOT EXISTS hei_dashboard
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hei_dashboard;

CREATE TABLE IF NOT EXISTS users (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username     VARCHAR(255) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL COMMENT 'bcrypt hash or plain text for dev',
  role         ENUM('global','regional') NOT NULL DEFAULT 'regional',
  country      CHAR(2) NULL     COMMENT 'ISO 3166-1 alpha-2 lowercase; NULL = all countries',
  display_name VARCHAR(255) NOT NULL,
  active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Example accounts
-- Passwords are stored as plain text here for convenience during development.
-- In production, replace with bcrypt hashes and set USE_BCRYPT=1 in .env.
-- =============================================================================

-- Global administrator (access to all countries, all tabs including Data Management)
INSERT INTO users (username, password, role, country, display_name) VALUES
  ('admin', 'CHANGE_ME', 'global', NULL, 'Global Administrator');

-- Norwegian institutional admin — Østfold University College
-- Email domain hiof.no is matched against institutional URL www.hiof.no
INSERT INTO users (username, password, role, country, display_name) VALUES
  ('admin@hiof.no', 'CHANGE_ME', 'regional', 'no', 'Østfold University College Admin');

-- Norwegian institutional admin — University of Oslo
INSERT INTO users (username, password, role, country, display_name) VALUES
  ('admin@uio.no', 'CHANGE_ME', 'regional', 'no', 'University of Oslo Admin');

-- Add your own institutional accounts below following the same pattern:
-- INSERT INTO users (username, password, role, country, display_name) VALUES
--   ('admin@example.no', 'securepassword', 'regional', 'no', 'Example University Admin');
