
routerAdd('GET','/backend/v1/check/fontes-painel',(e)=>{
  if(!e.auth) return e.json(401,{ok:false})
  const app=
  const out={ok:true}
  // ultimas metricas por fonte
  try{
    const ms=app.findRecordsByFilter(app.findCollectionByNameOrId('metricas_diarias'),'','',200,0)
    const porF={}
    var ultima=''
    for(const m of ms){
      const f=String(m.get('fonte')||m.get('canal')||'?')
      porF[f]=(porF[f]||0)+1
      const d=String(m.get('data')||m.get('dia')||'')
      if(d>ultima) ultima=d
    }
    out.metricas={total:ms.length,por_fonte:porF,ultima_data:ultima}
  }catch(e1){ out.metricas={erro:String(e1).slice(0,80)} }
  // canais com estado
  try{
    const cs=app.findRecordsByFilter(app.findCollectionByNameOrId('canal_estado'),'','',20,0)
    out.canais=[]
    for(const c of cs) out.canais.push({canal:String(c.get('canal')||''),
      ultimo:String(c.get('ultimo_sucesso_em')||'').slice(0,16)})
  }catch(e2){}
  return e.json(200,out)
},.requireAuth())
