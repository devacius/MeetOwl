import pool from "../db/index.js";
const addCaptions=async(caption)=>{
  if(!caption) return;
    try{
    console.log('captions to be inserted',caption);
    const query = `
    INSERT INTO "Captions" (speaker, timestamp, text)
    VALUES ($1, $2, $3)
    
  `;
  const values = [caption.speakerId, caption.timestamp, caption.text];
    await pool.query(query,values);
    }
    catch(error){
        console.error("Error inserting caption:", error);
    }
}
export default addCaptions;