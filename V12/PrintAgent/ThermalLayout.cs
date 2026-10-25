using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.Globalization;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace FuelFlow {
 public sealed class Receipt {
  public int schemaVersion; public string id,documentType,issuedAt,station,pump,plate,dni,ruc,businessName,fuel,gallons,unitPrice,subtotal,discount,total,mode,paymentMethod,state,pending; public bool demo;
 }
 public sealed class Piece {
  public string Text; public float X,Y,Width,Height,Points; public bool Bold; public string Align;
 }
 public sealed class Plan {
  public List<Piece> Pieces=new List<Piece>(); public List<float> Rules=new List<float>();
  public float RequiredHeightMm,RenderedHeightMm,AvailableHeightMm,LeftMm,TopMm,WidthMm; public bool Fits; public int Pages=1;
 }
 // Uses millimetres for all geometry; fonts are explicitly in typographic points.
 public static class ThermalLayout {
  // A6 head is 48 mm even when its custom-paper driver reports a wider area.
  public const float ContentWidthMm=48f;
  private static void Require(bool ok,string error){if(!ok)throw new ArgumentException(error);}
  public static Receipt Parse(string json){
   Receipt r=new JavaScriptSerializer().Deserialize<Receipt>(json);
   Require(r!=null&&r.schemaVersion==2&&r.demo&&(r.documentType=="BOLETA"||r.documentType=="FACTURA"),"Contrato de comprobante v2 invalido.");
   string[] required={r.id,r.issuedAt,r.station,r.pump,r.plate,r.fuel,r.mode,r.paymentMethod,r.state};
   foreach(string s in required)Require(!String.IsNullOrWhiteSpace(s)&&s.Length<=160&&!Regex.IsMatch(s,@"[\x00-\x1f\x7f]"),"Campo esencial del comprobante invalido.");
   foreach(string s in new[]{r.unitPrice,r.subtotal,r.discount,r.total,r.pending})Require(s!=null&&Regex.IsMatch(s,@"^\d{1,10}\.\d{2}$"),"Importe invalido.");
   Require(r.gallons!=null&&Regex.IsMatch(r.gallons,@"^\d{1,10}\.\d{3}$"),"Cantidad invalida.");
   Require(r.dni!=null&&r.ruc!=null&&r.businessName!=null,"Identidad no especificada.");
   Require(r.documentType=="BOLETA"?(r.ruc==""&&r.businessName==""):r.dni=="","Identidad incompatible con el tipo de comprobante.");
   Require(!(Decimal.Parse(r.pending,CultureInfo.InvariantCulture)>0&&r.state=="Pagado"),"Estado financiero incompatible.");
   return r;
  }
  private static Font FontFor(float points,bool bold){return new Font("Arial",points,bold?FontStyle.Bold:FontStyle.Regular,GraphicsUnit.Point);}
  private static StringFormat Format(string align){var f=(StringFormat)StringFormat.GenericTypographic.Clone();f.FormatFlags=StringFormatFlags.NoWrap|StringFormatFlags.MeasureTrailingSpaces;f.Trimming=StringTrimming.None;f.Alignment=align=="center"?StringAlignment.Center:align=="right"?StringAlignment.Far:StringAlignment.Near;return f;}
  private static float TextWidth(Graphics g,string text,Font font){using(var f=Format("left"))return g.MeasureString(text,font,new PointF(0,0),f).Width;}
  private static List<string> Wrap(Graphics g,string text,Font font,float width){
   var lines=new List<string>();string line="";
   foreach(string token in Regex.Split(text.Trim(),@"\s+")){
    if(line.Length>0&&TextWidth(g,line+" "+token,font)<=width){line+=" "+token;continue;}
    if(line.Length>0){lines.Add(line);line="";}
    foreach(char c in token){if(TextWidth(g,line+c,font)>width){Require(line.Length>0,"Ancho insuficiente para un caracter legible.");lines.Add(line);line="";}line+=c;}
   }
   if(line.Length>0)lines.Add(line);if(lines.Count==0)lines.Add("—");return lines;
  }
  private static float Add(Plan p,Graphics g,string text,float x,float y,float width,float points,bool bold,string align){
   using(var font=FontFor(points,bold)){
    float height;using(var f=Format("left"))height=g.MeasureString("Ag",font,new PointF(0,0),f).Height+0.15f;
    var lines=Wrap(g,text,font,width);foreach(string line in lines){p.Pieces.Add(new Piece{Text=line,X=x,Y=y,Width=width,Height=height,Points=points,Bold=bold,Align=align});y+=height;}return y;
   }
  }
  private static void Row(Plan p,Graphics g,ref float y,string label,string value,bool numeric){
   float labelWidth=14.5f,gap=0.7f;
   float a=Add(p,g,label,p.LeftMm,y,labelWidth,7,false,"left");
   float b=Add(p,g,String.IsNullOrEmpty(value)?"—":value,p.LeftMm+labelWidth+gap,y,p.WidthMm-labelWidth-gap,7,false,numeric?"right":"left");
   y=Math.Max(a,b)+0.25f;
  }
  private static void Rule(Plan p,ref float y){y+=0.7f;p.Rules.Add(y);y+=1f;}
  public static Plan Build(string json,Graphics g,RectangleF printable,SizeF paper){
   Require(Math.Abs(paper.Width-56.896f)<0.3f&&Math.Abs(paper.Height-100.076f)<0.7f,"Formato fijo de 100 mm no confirmado.");
   Require(printable.Width>=35&&printable.Width<=58&&printable.Height>30,"Area imprimible invalida.");
   var clipped=RectangleF.Intersect(printable,new RectangleF(0,0,paper.Width,paper.Height));
   clipped.Width=Math.Min(clipped.Width,ContentWidthMm);
   var p=new Plan{LeftMm=clipped.Left+1,TopMm=clipped.Top+1,WidthMm=clipped.Width-2,AvailableHeightMm=clipped.Height-3};
   Require(p.WidthMm>=33&&p.AvailableHeightMm>25,"No hay area util suficiente.");
   g.PageUnit=GraphicsUnit.Millimeter;
   Receipt r=Parse(json);float y=p.TopMm;
   y=Add(p,g,"PRIMAX FUELFLOW",p.LeftMm,y,p.WidthMm,10,true,"center");
   y=Add(p,g,r.documentType+" · DEMO",p.LeftMm,y,p.WidthMm,8,true,"center");
   if(r.id.StartsWith("physical-test-",StringComparison.Ordinal))y=Add(p,g,"PRUEBA DE IMPRESIÓN — SIN VALIDEZ FISCAL",p.LeftMm,y,p.WidthMm,7,true,"center");
   y=Add(p,g,"Sin validez fiscal / No validado por SUNAT",p.LeftMm,y,p.WidthMm,7,false,"center");Rule(p,ref y);
   Row(p,g,ref y,"Operación",r.id,false);
   var date=DateTimeOffset.Parse(r.issuedAt,CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind);
   var lima=TimeZoneInfo.ConvertTimeBySystemTimeZoneId(date,"SA Pacific Standard Time");
   Row(p,g,ref y,"Fecha",lima.ToString("dd/MM/yyyy HH:mm:ss",CultureInfo.InvariantCulture),false);
   Row(p,g,ref y,"Estación",r.station,false);Row(p,g,ref y,"Surtidor",r.pump,false);Row(p,g,ref y,"Placa",r.plate,false);
   if(r.documentType=="FACTURA"){Row(p,g,ref y,"RUC",r.ruc,false);Row(p,g,ref y,"Razón social",r.businessName,false);}else Row(p,g,ref y,"DNI",r.dni,false);
   Rule(p,ref y);Row(p,g,ref y,"Combustible",r.fuel,false);Row(p,g,ref y,"Cantidad",r.gallons+" gal",true);Row(p,g,ref y,"P. unitario","S/ "+r.unitPrice+"/gal",true);Row(p,g,ref y,"Subtotal","S/ "+r.subtotal,true);Row(p,g,ref y,"Descuento","S/ "+r.discount,true);
   Rule(p,ref y);float y1=Add(p,g,"TOTAL",p.LeftMm,y,13,9,true,"left");float y2=Add(p,g,"S/ "+r.total,p.LeftMm+14,y,p.WidthMm-14,9,true,"right");y=Math.Max(y1,y2);Rule(p,ref y);
   Row(p,g,ref y,"Modalidad",r.mode,false);Row(p,g,ref y,"Método",r.paymentMethod,false);Row(p,g,ref y,"Estado",r.state,false);
   if(Decimal.Parse(r.pending,CultureInfo.InvariantCulture)>0)Row(p,g,ref y,"Pendiente","S/ "+r.pending,true);
   y+=1;y=Add(p,g,"Gracias por tu visita",p.LeftMm,y,p.WidthMm,7,false,"center");
   p.RequiredHeightMm=y-p.TopMm;p.Fits=p.RequiredHeightMm<=p.AvailableHeightMm;
   // A fixed-height ticket can use spare space as leading, never smaller fonts.
   // Keep related label/value baselines aligned and reserve 2 mm at the end.
   if(p.Fits){var last=p.Pieces[p.Pieces.Count-1];float span=last.Y-p.TopMm;
    float leading=span>0?Math.Min(1.35f,(p.AvailableHeightMm-last.Height)/span):1;
    foreach(var v in p.Pieces)v.Y=p.TopMm+(v.Y-p.TopMm)*leading;
    for(int i=0;i<p.Rules.Count;i++)p.Rules[i]=p.TopMm+(p.Rules[i]-p.TopMm)*leading;
    p.RenderedHeightMm=last.Y+last.Height-p.TopMm;
   }
   return p;
  }
  public static void Draw(Plan p,Graphics g){
   Require(p.Fits,"El comprobante excede 100 mm. No se imprimio ni se dividio en paginas.");
   g.PageUnit=GraphicsUnit.Millimeter;g.TextRenderingHint=System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;
   foreach(var v in p.Pieces)using(var f=FontFor(v.Points,v.Bold))using(var sf=Format(v.Align))g.DrawString(v.Text,f,Brushes.Black,new RectangleF(v.X,v.Y,v.Width,v.Height),sf);
   using(var pen=new Pen(Color.Black,0.12f))foreach(float y in p.Rules)g.DrawLine(pen,p.LeftMm,y,p.LeftMm+p.WidthMm,y);
  }
  // Pure offscreen diagnostic. This method contains no PrintDocument/Print call.
  public static Plan Preview(string json,string output,float width,float left,int dpi){
   Require(dpi==203,"Resolucion de prueba invalida.");
   int w=(int)Math.Ceiling(56.896/25.4*dpi),h=(int)Math.Ceiling(100.076/25.4*dpi);
   using(var bmp=new Bitmap(w,h)){bmp.SetResolution(dpi,dpi);using(var g=Graphics.FromImage(bmp)){
    g.Clear(Color.White);var p=Build(json,g,new RectangleF(left,0,width,100.10f),new SizeF(56.896f,100.076f));
    if(p.Fits&&output!=null){Draw(p,g);bmp.Save(output,ImageFormat.Png);}return p;
   }}
  }
 }
}
