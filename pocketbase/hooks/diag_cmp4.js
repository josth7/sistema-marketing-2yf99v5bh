
routerAdd('GET','/backend/v1/diag/cmp4',(e)=>{
  if(!e.auth) return e.json(401,{ok:false})
  const colT=$app.findCollectionByNameOrId('whatsapp_transferencias')
  const trs=$app.findRecordsByFilter(colT,"",'',2000,0)
  const linhas=[]
  for(const t of trs){
    const c=String(t.get('created')||'')
    if(c<'2026-11-06') continue
    var l=null
    try{ l=$app.findRecordById('crm_leads',String(t.get('lead')||'')) }catch(e){ continue }
    linhas.push(c.slice(0,13)+'|'+String(t.get('estado'))+'|'+(String(l.get('owner_id')||'')!=='?'DONO':'-'))
  }
  linhas.sort()
  return e.json(200,{n:linhas.length,linhas:linhas})
},$apis.requireAuth())
