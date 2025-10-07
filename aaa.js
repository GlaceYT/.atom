const mongoose = require('mongoose');
const ServerConfig = require('./models/serverConfig/schema'); // adjust if path is different

const MONGO_URI = 'mongodb+srv://shiva:shiva@discordbot.opd5w.mongodb.net/?retryWrites=true&w=majority'; // 🔁 Replace with your DB connection string
const TARGET_SERVER_ID = '1397124436821282857';

async function main() {
    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Connected to MongoDB');

        const config = await ServerConfig.findOne({ serverId: TARGET_SERVER_ID });

        if (!config) {
            console.log('ℹ️ No ServerConfig found for that server ID.');
        } else {
            console.log('📝 ServerConfig Document:');
            console.log(JSON.stringify(config, null, 2));

            // Optional: Delete after confirmation
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });

            readline.question('⚠️ Do you want to delete this document? (yes/no): ', async (answer) => {
                if (answer.toLowerCase() === 'yes') {
                    await ServerConfig.deleteOne({ serverId: TARGET_SERVER_ID });
                    console.log('🗑️ Document deleted.');
                } else {
                    console.log('❎ No action taken.');
                }
                readline.close();
                mongoose.disconnect();
            });
        }
    } catch (err) {
        console.error('❌ Error:', err);
        mongoose.disconnect();
    }
}


async function cleanupDatabase() {
    try {
        // Connect to your database
        await mongoose.connect(MONGO_URI);
        
        const db = mongoose.connection.db;
        const collection = db.collection('welcomesettings');
        
        console.log('🔍 Checking current indexes...');
        const indexes = await collection.indexes();
        console.log('Current indexes:', indexes);
        
        // Step 1: Delete all documents with guildId: null
        console.log('🗑️ Removing documents with guildId: null...');
        const deleteResult = await collection.deleteMany({ guildId: null });
        console.log(`Deleted ${deleteResult.deletedCount} documents with guildId: null`);
        
        // Step 2: Drop the problematic guildId index if it exists
        try {
            console.log('🗑️ Dropping guildId_1 index...');
            await collection.dropIndex('guildId_1');
            console.log('✅ Successfully dropped guildId_1 index');
        } catch (error) {
            if (error.code === 27) {
                console.log('ℹ️ guildId_1 index does not exist, skipping...');
            } else {
                console.log('❌ Error dropping index:', error.message);
            }
        }
        
        // Step 3: Check if there are any documents with both guildId and serverId
        const docsWithBoth = await collection.find({ 
            guildId: { $exists: true }, 
            serverId: { $exists: true } 
        }).toArray();
        
        if (docsWithBoth.length > 0) {
            console.log(`🔄 Found ${docsWithBoth.length} documents with both guildId and serverId`);
            console.log('These will be handled by the migration...');
        }
        
        // Step 4: Migrate guildId to serverId for existing documents
        const docsWithGuildId = await collection.find({ 
            guildId: { $exists: true, $ne: null },
            serverId: { $exists: false }
        }).toArray();
        
        if (docsWithGuildId.length > 0) {
            console.log(`🔄 Migrating ${docsWithGuildId.length} documents from guildId to serverId...`);
            
            for (const doc of docsWithGuildId) {
                await collection.updateOne(
                    { _id: doc._id },
                    { 
                        $set: { serverId: doc.guildId },
                        $unset: { guildId: "" }
                    }
                );
            }
            console.log('✅ Migration completed');
        }
        
        // Step 5: Ensure proper index on serverId
        try {
            console.log('📋 Creating index on serverId...');
            await collection.createIndex({ serverId: 1 }, { unique: true });
            console.log('✅ Successfully created serverId_1 index');
        } catch (error) {
            console.log('ℹ️ serverId index might already exist:', error.message);
        }
        
        console.log('🎉 Database cleanup completed successfully!');
        
        // Verify the final state
        const finalIndexes = await collection.indexes();
        console.log('Final indexes:', finalIndexes.map(idx => idx.name));
        
        const totalDocs = await collection.countDocuments();
        console.log(`📊 Total documents in collection: ${totalDocs}`);
        
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    } finally {
        await mongoose.disconnect();
    }
}

// Run the cleanup
cleanupDatabase();
main();
