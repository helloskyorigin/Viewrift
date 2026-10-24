// Built-in visual example used only as a reference during development.
// This is not a bypass for public-URL scanning, which blocks local network targets.
export default function DemoSite() {
  return <main style={{fontFamily:"Arial, sans-serif",padding:24,maxWidth:1100,margin:"auto"}}>
    <nav style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #ddd",paddingBottom:20}}><b>BrightField Studio</b><span>Work &nbsp;&nbsp; About &nbsp;&nbsp; Contact</span></nav>
    <section style={{paddingTop:96}}><h1 style={{fontSize:"clamp(40px,6vw,80px)",letterSpacing:"-.06em",maxWidth:900,marginBottom:18}}>Design for a brighter tomorrow.</h1><p style={{color:"#777",fontSize:20,maxWidth:650,lineHeight:1.6}}>A fictional responsive sample page, made to test Viewrift's browser capture.</p><button style={{padding:"16px 24px",background:"#222",border:0,borderRadius:8,color:"#fff"}}>Get in touch</button></section>
    <footer style={{marginTop:160,borderTop:"1px solid #ddd",paddingTop:20,color:"#888"}}>Sample page · No real business</footer>
  </main>;
}
