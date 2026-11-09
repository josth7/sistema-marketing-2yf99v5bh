routerAdd('POST','/backend/v1/gestao/distribuir-orfaos',(e)=>{
  if(!e.auth) return e.json(401,{ok:false})
  const colL=$app.findCollectionByNameOrId('crm_leads')
  const leads=$app.findRecordsByFilter(colL,'fixture=false','',12000,0)
  const 
  for(const l of leads){
    if(String(l.get('owner_id')||'')!=='') continue
    if(String(l.get('status')||'')==='descartado') continue
    orf.push(l)
  }
  const colT=$app.findCollectionByNameOrId('whatsapp_transferencias')
  var criados=0
  for(const l of orf){
    try{
      const tr=new Record(colT)
      tr.set('lead',l.id); tr.set('origem_pedido','botao')
      tr.set('motivo','primeiro_contato'); tr.set('simulacao',false)
      tr.set('fixture',false); tr.set('detalhe','orfao 09/11')
      $app.save(tr); criados++
    }catch(x){}
  }
  var ok=0,sem=0,porV={}
  for(const l of orf){
    var r2=null
    try{ r2=$app.findRecordById('crm_leads',l.id) }catch(x){}
    const d=r2?String(r2.get('owner_id')||'')':''
    if(d!==''){ ok++
      var nm=d
      try{ nm=String($app.findRecordById('users',d).get('name')||d) }catch(x){}
      porV[nm]=(porV[nm]||0)+1
    } else sem++
  }
  return e.json(200,{ok:true,,encontrados:orf.length,criados:criados,com_dono:ok,sem_dono:sem,por_vendedor:porV})
},.requireAuth())