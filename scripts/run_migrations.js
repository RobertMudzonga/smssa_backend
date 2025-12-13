const db = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
    console.log('Starting database migrations...\n');

    try {
        // Migration 1: Create prospects table and add converted flag
        console.log('Running migration 001_create_prospects_and_leads_converted.sql...');
        const migration1 = fs.readFileSync(
            path.join(__dirname, '../migrations/001_create_prospects_and_leads_converted.sql'),
            'utf8'
        );
        await db.query(migration1);
        console.log('✓ Migration 001 completed successfully\n');

        // Migration 2: Add stage tracking to prospects
        console.log('Running migration 002_add_prospect_stage_tracking.sql...');
        const migration2 = fs.readFileSync(
            path.join(__dirname, '../migrations/002_add_prospect_stage_tracking.sql'),
            'utf8'
        );
        await db.query(migration2);
        console.log('✓ Migration 002 completed successfully\n');

        // Migration 003: Add cold_lead_stage to leads
        console.log('Running migration 003_add_cold_lead_stage.sql...');
        const migration3 = fs.readFileSync(
            path.join(__dirname, '../migrations/003_add_cold_lead_stage.sql'),
            'utf8'
        );
        await db.query(migration3);
        console.log('✓ Migration 003 completed successfully\n');

        // Migration 004: Create tags and prospect_tags join table
        console.log('Running migration 004_create_tags_and_prospect_tags.sql...');
        const migration4 = fs.readFileSync(
            path.join(__dirname, '../migrations/004_create_tags_and_prospect_tags.sql'),
            'utf8'
        );
        await db.query(migration4);
        console.log('✓ Migration 004 completed successfully\n');

        // Migration 005: Add extra prospect fields (quotes, assigned_to, financials)
        console.log('Running migration 005_add_prospect_extra_fields.sql...');
        const migration5 = fs.readFileSync(
            path.join(__dirname, '../migrations/005_add_prospect_extra_fields.sql'),
            'utf8'
        );
        await db.query(migration5);
        console.log('✓ Migration 005 completed successfully\n');

        // Migration 006: Add deal_name to prospects
        console.log('Running migration 006_add_deal_name_to_prospects.sql...');
        const migration6 = fs.readFileSync(
            path.join(__dirname, '../migrations/006_add_deal_name_to_prospects.sql'),
            'utf8'
        );
        await db.query(migration6);
        console.log('✓ Migration 006 completed successfully\n');

        // Migration 007: Create document_folders table
        console.log('Running migration 007_create_document_folders.sql...');
        const migration7 = fs.readFileSync(
            path.join(__dirname, '../migrations/007_create_document_folders.sql'),
            'utf8'
        );
        await db.query(migration7);
        console.log('✓ Migration 007 completed successfully\n');

        // Migration 008: Create documents table (store uploads)
        console.log('Running migration 008_create_documents_table.sql...');
        const migration8 = fs.readFileSync(
            path.join(__dirname, '../migrations/008_create_documents_table.sql'),
            'utf8'
        );
        await db.query(migration8);
        console.log('✓ Migration 008 completed successfully\n');

        console.log('All migrations completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error running migrations:', error);
        process.exit(1);
    }
}

runMigrations();
