const db = require('./db');

async function checkActionAid() {
    try {
        const clientResult = await db.query("SELECT corporate_id, name, access_token FROM corporate_clients WHERE name ILIKE '%Action Aid%'");
        console.log('--- Corporate Clients ---');
        clientResult.rows.forEach(r => console.log(`ID: ${r.corporate_id}, Name: ${r.name}, Token: ${r.access_token}`));

        if (clientResult.rows.length > 0) {
            const clientIds = clientResult.rows.map(r => r.corporate_id);
            const casesResult = await db.query(
                "SELECT case_id, case_reference, case_title, corporate_client_id FROM legal_cases WHERE corporate_client_id = ANY($1)",
                [clientIds]
            );
            console.log('\n--- Legal Cases ---');
            casesResult.rows.forEach(c => console.log(`ID: ${c.case_id}, Ref: ${c.case_reference}, Title: ${c.case_title}, ClientID: ${c.corporate_client_id}`));
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await db.pool.end();
    }
}

checkActionAid();
