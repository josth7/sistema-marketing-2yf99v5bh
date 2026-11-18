/// <reference path="../pb_data/types.d.ts" />
// TEMPORÁRIO (18/11) — só leitura: os 74 leads ainda em "esperando" tiveram
// aviso ao vendedor enviado hoje? Agrupa por situação. APAGAR depois.
cronAdd('tmp_1811_bomdia', '* * * * *', () => {
  if ($app.store().get('tmp_avisados74')) return
  $app.store().set('tmp_avisados74', true)
  const L =
    'ccbsje2k4o35mae,d4pbcdk495n2w2y,wacfjkm9a3useuy,sihcja3xaurgv4r,2xc4g0u9npci2y5,1m6rtnpbrzg801z,3ct6ly608bpj8a8,7v81yrpxvvf1jva,d557whn5s2r2crp,8js57cuhvp4d75k,nwujqkkwm0c7e7d,gqsg9h2f1k5v6lv,5hlctksj5sl0ec6,kjsq8p2ejg4m904,p65tduab2qxeybj,f3fdrmqxq1s3nv8,uou1v2p12erpq50,qkopxfpism43g39,c7hotnn3glfor6m,yc299tl669gfp76,mze0zshw60u5xkk,1g2gdxoz52m237z,r2gwieu3as4ptrz,9qrbftc8dhsrl0c,7rmgparw8akbynt,42g9hozglxbubln,f0pd0xd9togsqx2,ii1u4bod6eaun1y,kldirokj4tq5hlj,70iwkdnt7jclqhy,j6sol1rbld20io6,6qkhuml8js997tk,quj48o9afh9ucn2,rbmb2ec1535bhf3,7b33ledn1ovwf97,uqwpq4wbh0ngc9c,e3gi2vt4je5hq9n,kuhcanqtxy1yl9e,mcbllvqwn11x4x6,ra396mg3mddcy3c,9ydx47pajqsmdor,92enpsp1nk6hv58,7j3bxpdzv86izio,tgdgab9ykpm1coy,r1tfqi7nid9xdl7,iil3wfiqp7967ka,m0rh18u61gkcq76,9rhjdk6qx53m4w1,1zo57iu5m3ktbma,5mktn3duolii86q,laggh9u6em4wydt,1giycbe764yyn54,61lnw1550bxe2lk,glz6q0dt2xef9qo,oy6ui84ecs7hze3,e2t8hczjsy0rxu2,1xzfowawtyfoop0,cxukrpdvnlrxncz,239j5kzn096j2ye,vxnwa4tjtz5hb7a,1046x4yobrid05t,yio830k6gqqkwdp,fwe0u0u7p217w1d,1y9suy7weeshn1c,2wd0tm72fmsr3el,8knsaa5k5ls0yd4,axxfiai0kwa1l59,fqd7x0lev2cc8q3,eznzbofmq8b28pz,5gemmu0dmhopjl3,nat7azmmvpoq6np,3fhdmlzuj7hvb9i,c2srp2o517h0v74,ro8hp8vheo7dtdo'.split(
      ',',
    )
  try {
    const sit = {}
    const semAviso = []
    for (const id of L) {
      var melhor = 'sem_aviso'
      const ev = $app.findRecordsByFilter(
        'whatsapp_envios',
        "lead='" + id + "' && motivo='aviso_vendedor' && created>='2026-11-17 03:00:00'",
        '',
        20,
        0,
      )
      for (const e of ev) {
        const st = String(e.get('estado'))
        if (st === 'enviado') melhor = 'enviado'
        else if (melhor !== 'enviado') melhor = st
      }
      sit[melhor] = (sit[melhor] || 0) + 1
      if (melhor !== 'enviado') semAviso.push(id + ':' + melhor)
    }
    console.log('tmp_avisados74: ' + JSON.stringify(sit) + ' | nao_enviados: ' + semAviso.join(' '))
  } catch (e) {
    console.log('tmp_avisados74: erro ' + String(e).slice(0, 150))
  }
})
