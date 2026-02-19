import pool from "../db/index.js";
const addCaptions = async (caption) => {
  if (!caption) return;
  try {
    console.log('captions to be inserted', caption);
    const query = `
    INSERT INTO "Captions" (speaker, timestamp, text)
    VALUES ($1, $2, $3)
    
  `;
    const values = [caption.speakerId, caption.timestamp, caption.text];
    await pool.query(query, values);
  }
  catch (error) {
    console.error("Error inserting caption:", error);
  }
}
const getCaptions = async () => {
  try {
    const query = `SELECT * FROM "Captions" ORDER BY timestamp DESC LIMIT 1`;
    const result= await pool.query(query);
    console.log('captions fetched from DB',result.rows[0].text);
    return result.rows[0].text;
  }
  catch (error) {
    console.error("Error fetching captions:", error);
    return [];
  }
}
  export  {addCaptions,getCaptions};