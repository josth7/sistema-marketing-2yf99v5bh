
routerAdd('GET','/backend/v1/empresas/estado-gol7',(e)=>{
  if(!e.auth) return e.json(401,{ok:false})
  const out={ok:true}
  const emps=.findRecordsByFilter('empresas','','',10,0)
  out.empresas=[]
  for(const x of emps) out.empresas.push({nome:String(x.get('apelido')||x.get('nome')),ativa:x.get('ativa')===true,id:x.id.slice(0,8)})
  // Sabrina existe?
  const sab=.findRecordsByFilter('users',"email='goo7.ecmm@gmail.com'",'',1,0)
  out.sabrina = sab.length>0 ? {id:sab[0].id.slice(0,8),nome:String(sab[0].get('name'))} : null
  if(sab.length>0){
    const gs=.findRecordsByFilter('access_grants',"user_id='"+sab[0].id+"' && revoked_at=''",'',5,0)
    const nomesE={}
    for(const x of emps) nomesE[x.id]=String(x.get('apelido')||x.get('nome'))
    out.sabrina_grants=[]
    for(const g of gs) out.sabrina_grants.push({role:String(g.get('role')),empresa:nomesE[String(g.get('empresa')||'')]||'(vazio)'})
  }
  // config da Gol 7
  var idG=''
  for(const x of emps) if(String(x.get('apelido'))==='Gol 7') idG=x.id
  const cfgs=.findRecordsByFilter('atendimento_config',"empresa='"+idG+"'",'',5,0)
  out.config_gol7 = cfgs.length>0 ? {versao:Number(cfgs[0].get('versao')||0),ligado:cfgs[0].get('ligado')===true} : null
  return e.json(200,out)
},.requireAuth())
