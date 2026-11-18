const failure = hold => Object.assign(new Error(hold),{hold});
export function ledgerFor(pool) {
  return {
    async consume(source){
      return (await pool.query('INSERT INTO website_quote_pilot_used(source) VALUES($1) ON CONFLICT DO NOTHING RETURNING source',[source])).rowCount===1;
    },
    async exclusive(source,task){
      const db=await pool.connect();
      let locked=false, broken=false;
      try {
        ({locked}= (await db.query("SELECT pg_try_advisory_lock(hashtextextended('cooltech.website.quote:' || $1, 0)) AS locked",[source])).rows[0]);
        if(!locked)throw failure('claim_busy');
        return await task({
          async plan(digest){
            await db.query('INSERT INTO website_quote_plan VALUES($1,$2) ON CONFLICT DO NOTHING',[source,digest]);
            if((await db.query('SELECT digest FROM website_quote_plan WHERE source=$1',[source])).rows[0]?.digest!==digest)
              throw failure('plan_changed');
          },
          async intent(step,id){
            const result=await db.query('INSERT INTO website_quote_intent(source,step,intent_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING intent_id',[source,step,id]);
            if(result.rowCount)return {fresh:true,id:result.rows[0].intent_id};
            const {intent_id}= (await db.query('SELECT intent_id FROM website_quote_intent WHERE source=$1 AND step=$2',[source,step])).rows[0];
            return {fresh:false,id:intent_id};
          },
          async confirm(step,id){
            if((await db.query('UPDATE website_quote_intent SET verified=true WHERE source=$1 AND step=$2 AND intent_id=$3',[source,step,id])).rowCount!==1)
              throw failure('invalid_receipt');
          }
        });
      } finally {
        try{
          if(locked&&!((await db.query("SELECT pg_advisory_unlock(hashtextextended('cooltech.website.quote:' || $1, 0)) AS unlocked",[source])).rows[0]?.unlocked))broken=true;
        }catch{broken=true;}
        db.release(broken);
      }
    }
  };
}
