
routerAdd('GET','/backend/v1/diag/hora-servidor',(e)=>{
  if(!e.auth) return e.json(401,{ok:false})
  const d=new Date()
  return e.json(200,{iso:d.toISOString(),utc_hora:d.getUTCHours(),utc_min:d.getUTCMinutes(),
    local_hora:d.getHours(),local_min:d.getMinutes(),offset_min:d.getTimezoneOffset(),
    tz:String(d)})
},.requireAuth())
