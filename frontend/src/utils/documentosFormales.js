// PDF de archivo formal tamaño carta para recibos, facturas de prueba y cotizaciones.
// No emite FEL, no registra operaciones y no cambia la impresión térmica.
const W = 612
const H = 792
const M = 36
const VERDE = [0.13, 0.30, 0.23]
const OSCURO = [0.16, 0.21, 0.18]
const GRIS = [0.40, 0.45, 0.42]
const BORDE = [0.79, 0.84, 0.79]
const CREMA = [0.96, 0.97, 0.94]
const BLANCO = [1, 1, 1]
const extraAnsi = new Map([[0x2018,0x91],[0x2019,0x92],[0x201c,0x93],[0x201d,0x94],[0x2013,0x96],[0x2014,0x97],[0x2022,0x95]])
const ansi = (cadena) => {
  const bytes = []
  for (const caracter of String(cadena)) {
    const n = caracter.codePointAt(0)
    bytes.push(n <= 255 ? n : extraAnsi.get(n) ?? 63)
  }
  return Uint8Array.from(bytes)
}
const escapar = (valor) => String(valor).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[\r\n]/g,' ')
const dato = (valor, respaldo = '—') => valor == null || String(valor).trim() === '' ? respaldo : String(valor).trim()
const color = (c) => c.map((v) => v.toFixed(3)).join(' ')
const medir = (contenido, tamano, negrita = false) => {
  let unidades = 0
  for (const c of String(contenido)) {
    if (c === ' ') unidades += 0.29
    else if (/[ilI1.,:;!'|]/.test(c)) unidades += 0.29
    else if (/[mwMW@%]/.test(c)) unidades += 0.84
    else if (/[A-Z0-9]/.test(c)) unidades += 0.61
    else unidades += 0.54
  }
  return unidades * tamano * (negrita ? 1.04 : 1.02)
}
const partir = (contenido, maximo, tamano = 8, negrita = false) => {
  const palabras = dato(contenido, '').replace(/\s+/g,' ').trim().split(' ')
  const resultado = []
  let actual = ''
  for (const palabra of palabras) {
    if (!palabra) continue
    const candidato = actual ? actual + ' ' + palabra : palabra
    if (medir(candidato,tamano,negrita) <= maximo) { actual = candidato; continue }
    if (actual) resultado.push(actual)
    actual = ''
    for (const letra of palabra) {
      if (actual && medir(actual + letra,tamano,negrita) > maximo) {
        resultado.push(actual)
        actual = ''
      }
      actual += letra
    }
  }
  if (actual) resultado.push(actual)
  return resultado.length ? resultado : ['']
}
const escribir = (p, contenido, x, y, config = {}) => {
  const { tamano = 9, negrita = false, tinta = OSCURO, alineacion = 'izquierda' } = config
  const valor = dato(contenido, '')
  const ancho = medir(valor,tamano,negrita)
  const pos = alineacion === 'derecha' ? x - ancho : alineacion === 'centro' ? x - ancho / 2 : x
  p.push(color(tinta) + ' rg BT /' + (negrita ? 'F2' : 'F1') + ' ' + tamano + ' Tf 1 0 0 1 ' + pos.toFixed(2) + ' ' + y.toFixed(2) + ' Tm (' + escapar(valor) + ') Tj ET')
}
const trazo = (p,x1,y1,x2,y2,tinta=BORDE,grosor=.6) => p.push(color(tinta)+' RG '+grosor+' w '+x1+' '+y1.toFixed(2)+' m '+x2+' '+y2.toFixed(2)+' l S')
const cuadro = (p,x,y,w,h,relleno=BLANCO,borde=BORDE) => {
  p.push(color(relleno)+' rg '+x+' '+y.toFixed(2)+' '+w+' '+h.toFixed(2)+' re f')
  if(borde) p.push(color(borde)+' RG .7 w '+x+' '+y.toFixed(2)+' '+w+' '+h.toFixed(2)+' re S')
}
const escribirMultilinea = (p,t,x,y,ancho,tamano=8,interlineado=11,negrita=false,tinta=OSCURO) => {
  const fragmentos = partir(t,ancho,tamano,negrita)
  fragmentos.forEach((f,i) => escribir(p,f,x,y-i*interlineado,{tamano,negrita,tinta}))
  return fragmentos.length
}
const esFactura = (d) => d.tipo === 'factura-demostracion'
const esVenta = (d) => d.tipo === 'recibo' || esFactura(d)
const titulo = (d) => esFactura(d) ? 'FACTURA DE DEMOSTRACIÓN' : d.tipo === 'recibo' ? 'RECIBO' : 'COTIZACIÓN'

function dibujarPaginas(doc,logo) {
  const paginas = []
  let p
  let y
  const nuevaPagina = (continuacion = false) => {
    p = []
    paginas.push(p)
    trazo(p,M,758,W-M,758,VERDE,1.6)
    if (!continuacion) {
      cuadro(p,M,679,W-M*2,77)
      if (logo) p.push('q 157 0 0 52 49 690 cm /Logo Do Q')
      else escribir(p,'E-farm',49,713,{tamano:21,negrita:true,tinta:VERDE})
      escribir(p,'Sistema administrativo',211,706,{tamano:8,tinta:GRIS})
      escribir(p,titulo(doc),561,738,{tamano:10,negrita:true,tinta:VERDE,alineacion:'derecha'})
      escribir(p,esFactura(doc) ? 'Venta '+dato(doc.ventaNumero) : dato(doc.numero),561,720,{tamano:11.5,negrita:true,alineacion:'derecha'})
      escribir(p,'Serie '+dato(doc.serie),561,704,{tamano:8,tinta:GRIS,alineacion:'derecha'})
      escribir(p,dato(doc.fecha),561,692,{tamano:8,tinta:GRIS,alineacion:'derecha'})
      y=662
      if(esFactura(doc)) {
        cuadro(p,M,y-26,W-2*M,22,CREMA)
        escribir(p,'DOCUMENTO DE PRUEBA - SIN VALIDEZ FISCAL. No es un DTE ni una factura FEL certificada.',W/2,y-18,{tamano:7.5,negrita:true,tinta:VERDE,alineacion:'centro'})
        y-=39
      }
      cuadro(p,M,y-116,W-2*M,116)
      trazo(p,306,y,306,y-116)
      escribir(p,'COMPRADOR',49,y-17,{tamano:8,negrita:true,tinta:VERDE})
      const nombre = partir(doc.cliente,242,8.8,true)
      nombre.slice(0,3).forEach((t,i)=>escribir(p,t,49,y-36-i*11,{tamano:8.8,negrita:true}))
      const nitY=y-39-Math.min(nombre.length-1,2)*11
      escribir(p,'NIT '+dato(doc.nit,'CF'),49,nitY-13,{tamano:7.5,tinta:GRIS})
      const direccion=partir(doc.direccion || 'Dirección no indicada',240,7.1)
      direccion.slice(0,2).forEach((t,i)=>escribir(p,t,49,nitY-27-i*9,{tamano:7.1,tinta:GRIS}))
      escribir(p,dato(doc.clienteTipo,''),49,y-104,{tamano:7.1,negrita:true,tinta:VERDE})
      escribir(p,'DOCUMENTO',318,y-17,{tamano:8,negrita:true,tinta:VERDE})
      const datos = esVenta(doc)
        ? [['Venta',doc.ventaNumero || doc.numero],['Fecha',doc.fecha],['Usuario',doc.usuario],['Origen',doc.origen]]
        : [['Cotización',doc.numero],['Fecha',doc.fecha],['Usuario',doc.usuario],['Estado',doc.estado]]
      datos.forEach((par,i)=>{
        const py=y-36-i*21
        escribir(p,par[0],319,py,{tamano:7.5,tinta:GRIS})
        const partes=partir(par[1],146,7.5,true)
        partes.slice(0,2).forEach((t,j)=>escribir(p,t,561,py-j*8.5,{tamano:7.5,negrita:true,alineacion:'derecha'}))
      })
      y-=138
    } else {
      escribir(p,'E-farm / '+titulo(doc)+' '+dato(doc.numero),M,735,{tamano:10.5,negrita:true,tinta:VERDE})
      escribir(p,'Continuación',W-M,735,{tamano:8,tinta:GRIS,alineacion:'derecha'})
      y=711
    }
  }
  const headerTabla=(continuacion=false)=>{
    escribir(p,continuacion?'Productos (continuación)':'Productos',M,y,{tamano:11,negrita:true})
    escribir(p,String(doc.productos.length)+' líneas',W-M,y+1,{tamano:7.5,tinta:GRIS,alineacion:'derecha'})
    y-=15
    cuadro(p,M,y-25,W-2*M,25,CREMA)
    ;[['PRODUCTO',42],['PRESENTACIÓN',229],['CANT.',314],['MANOJOS',359],['PRECIO',415],['SUBTOTAL',492]]
      .forEach(([t,x])=>escribir(p,t,x,y-16,{tamano:7.1,negrita:true,tinta:VERDE}))
    y-=25
  }
  nuevaPagina()
  headerTabla()
  const divisiones=[224,307,355,408,478]
  doc.productos.forEach((producto,i)=>{
    const desc=partir(producto.descripcion || producto.nombre,172,7)
    const codigo=dato(producto.codigo,'')
    const pres=partir(producto.presentacion,71,7.3)
    const alto=Math.max(39,16+Math.max((codigo?1:0)*10+desc.length*10,pres.length*10+(producto.manojosPorUnidad?10:0)))
    if(y-alto<150){nuevaPagina(true);headerTabla(true)}
    cuadro(p,M,y-alto,W-2*M,alto,i%2?CREMA:BLANCO)
    divisiones.forEach((x)=>trazo(p,x,y,x,y-alto,BORDE,.4))
    let vy=y-13
    if(codigo){escribir(p,codigo,42,vy,{tamano:7.5,negrita:true});vy-=11}
    desc.forEach((t)=>{escribir(p,t,42,vy,{tamano:7,tinta:GRIS});vy-=10})
    pres.forEach((t,j)=>escribir(p,t,229,y-13-j*10,{tamano:7.3,negrita:j===0}))
    if(producto.manojosPorUnidad)escribir(p,dato(producto.manojosPorUnidad)+' manojos/u',229,y-13-pres.length*10,{tamano:6.4,tinta:GRIS})
    escribir(p,dato(producto.cantidad),314,y-16,{tamano:8})
    escribir(p,dato(producto.manojos),359,y-16,{tamano:8})
    escribir(p,dato(producto.precio),470,y-16,{tamano:7.4,alineacion:'derecha'})
    escribir(p,dato(producto.subtotal),568,y-16,{tamano:7.4,negrita:true,alineacion:'derecha'})
    y-=alto
  })
  const notas=partir(doc.observaciones || 'Sin observaciones.',312,8)
  const conPago=esVenta(doc)&&doc.pagoRecibido!==null&&doc.pagoRecibido!==undefined
  const altoCierre=Math.max(conPago?115:91,48+notas.length*11)
  if(y-14-altoCierre<54)nuevaPagina(true)
  else y-=14
  cuadro(p,M,y-altoCierre,345,altoCierre)
  cuadro(p,390,y-altoCierre,186,altoCierre)
  escribir(p,'Observaciones',47,y-20,{tamano:9,negrita:true})
  notas.forEach((f,i)=>escribir(p,f,47,y-38-i*11,{tamano:7.8,tinta:GRIS}))
  const totales=[['Subtotal',doc.subtotal,false],['TOTAL',doc.total,true]]
  if(conPago){totales.push(['RECIBIDO',doc.pagoRecibido,false]);totales.push(['CAMBIO',doc.cambioVenta,false])}
  let ty=y-19
  totales.forEach(([t,v,fuerte])=>{
    if(fuerte){trazo(p,403,ty+8,564,ty+8,VERDE,1.1);ty-=9}
    escribir(p,t,403,ty,{tamano:fuerte?11:8,negrita:fuerte})
    escribir(p,dato(v),563,ty,{tamano:fuerte?11:8,negrita:true,alineacion:'derecha'})
    ty-=fuerte?24:19
  })
  if(!esVenta(doc))escribir(p,'Cotización comercial. No confirma una venta.',47,y-altoCierre+13,{tamano:7,tinta:GRIS})
  paginas.forEach((pagina,i)=>{
    trazo(pagina,M,39,W-M,39)
    escribir(pagina,'E-farm  |  ECOFARM S.A.  |  Documento comercial',M,27,{tamano:7,tinta:GRIS})
    escribir(pagina,'Página '+(i+1)+' de '+paginas.length,W-M,27,{tamano:7,tinta:GRIS,alineacion:'derecha'})
  })
  return paginas
}

async function cargarLogo(ubicacion) {
  if(!ubicacion||typeof Image==='undefined'||typeof document==='undefined')return null
  try {
    const imagen=new Image()
    imagen.src=ubicacion
    await imagen.decode()
    const ancho=560,alto=Math.round(ancho*imagen.naturalHeight/imagen.naturalWidth)
    const canvas=document.createElement('canvas')
    canvas.width=ancho
    canvas.height=alto
    const contexto=canvas.getContext('2d')
    if(!contexto)return null
    contexto.fillStyle='#fff'
    contexto.fillRect(0,0,ancho,alto)
    contexto.drawImage(imagen,0,0,ancho,alto)
    const base64=canvas.toDataURL('image/jpeg',.88).split(',')[1]
    const binario=atob(base64),bytes=new Uint8Array(binario.length)
    for(let i=0;i<binario.length;i+=1)bytes[i]=binario.charCodeAt(i)
    return {ancho,alto,bytes}
  } catch {return null}
}

function serializar(paginas,logo) {
  const conLogo=Boolean(logo)
  const inicio=conLogo?6:5
  const referencias=paginas.map((_,i)=>inicio+i*2)
  const objetos=new Map()
  objetos.set(1,{cuerpo:'<< /Type /Catalog /Pages 2 0 R >>'})
  objetos.set(2,{cuerpo:'<< /Type /Pages /Count '+paginas.length+' /Kids ['+referencias.map((x)=>x+' 0 R').join(' ')+'] >>'})
  objetos.set(3,{cuerpo:'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'})
  objetos.set(4,{cuerpo:'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'})
  if(conLogo)objetos.set(5,{cuerpo:'<< /Type /XObject /Subtype /Image /Width '+logo.ancho+' /Height '+logo.alto+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+logo.bytes.length+' >>',stream:logo.bytes})
  paginas.forEach((pagina,i)=>{
    const id=referencias[i],contenido=ansi(pagina.join('\n')+'\n')
    objetos.set(id,{cuerpo:'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> '+(conLogo?'/XObject << /Logo 5 0 R >>':'')+' >> /Contents '+(id+1)+' 0 R >>'})
    objetos.set(id+1,{cuerpo:'<< /Length '+contenido.length+' >>',stream:contenido})
  })
  const partes=[],posiciones=[0]
  let longitud=0
  const agregar=(contenido)=>{const bytes=typeof contenido==='string'?ansi(contenido):contenido;partes.push(bytes);longitud+=bytes.length}
  agregar('%PDF-1.4\n%âãÏÓ\n')
  const total=inicio-1+paginas.length*2
  for(let id=1;id<=total;id+=1){
    const o=objetos.get(id)
    posiciones[id]=longitud
    agregar(id+' 0 obj\n'+o.cuerpo+'\n')
    if(o.stream){agregar('stream\n');agregar(o.stream);agregar('\nendstream\n')}
    agregar('endobj\n')
  }
  const xref=longitud
  agregar('xref\n0 '+(total+1)+'\n0000000000 65535 f \n')
  for(let id=1;id<=total;id+=1)agregar(String(posiciones[id]).padStart(10,'0')+' 00000 n \n')
  agregar('trailer\n<< /Size '+(total+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n')
  const salida=new Uint8Array(longitud)
  let posicion=0
  for(const parte of partes){salida.set(parte,posicion);posicion+=parte.length}
  return new Blob([salida],{type:'application/pdf'})
}

export async function generarPDFFormal(documento,logoSrc=null) {
  if(!documento||!Array.isArray(documento.productos))throw new Error('No se encontraron datos para generar el PDF.')
  const logo=await cargarLogo(logoSrc)
  return serializar(dibujarPaginas(documento,logo),logo)
}
export async function verPDFFormal(documento,logoSrc) {
  const ventana=window.open('','_blank')
  if(!ventana)throw new Error('El navegador bloqueó la vista previa. Permite ventanas emergentes.')
  try {
    const pdf=await generarPDFFormal(documento,logoSrc)
    const url=URL.createObjectURL(pdf)
    ventana.location.replace(url)
    window.setTimeout(()=>URL.revokeObjectURL(url),600000)
  } catch(error){ventana.close();throw error}
}
export async function descargarPDFFormal(documento,logoSrc) {
  const pdf=await generarPDFFormal(documento,logoSrc)
  const nombre=String(documento.titulo+'-'+documento.numero).normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,65)
  const url=URL.createObjectURL(pdf)
  const enlace=document.createElement('a')
  enlace.href=url
  enlace.download=nombre+'.pdf'
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),30000)
}
