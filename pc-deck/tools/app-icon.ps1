param([string]$Aumid, [string]$Out, [int]$Size = 256)
# Pede ao Shell do Windows o icone de um app do Iniciar (o mesmo do menu) e salva como PNG transparente.
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class ShellIcon {
  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory { void GetImage(SIZE size, int flags, out IntPtr phbm); }
  [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; public SIZE(int x, int y){cx=x;cy=y;} }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory ppv);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
  [DllImport("gdi32.dll")] static extern int GetObject(IntPtr h, int c, ref BITMAP b);
  [StructLayout(LayoutKind.Sequential)] struct BITMAP { public int bmType, bmWidth, bmHeight, bmWidthBytes; public short bmPlanes, bmBitsPixel; public IntPtr bmBits; }

  public static void Save(string parsingName, string outPath, int size) {
    IShellItemImageFactory f;
    SHCreateItemFromParsingName(parsingName, IntPtr.Zero, new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), out f);
    IntPtr hbm;
    f.GetImage(new SIZE(size, size), 0x1 /* BIGGERSIZEOK */ | 0x4 /* ICONONLY */, out hbm);
    try {
      BITMAP bm = new BITMAP();
      GetObject(hbm, Marshal.SizeOf(typeof(BITMAP)), ref bm);
      using (var bmp = new Bitmap(bm.bmWidth, bm.bmHeight, PixelFormat.Format32bppArgb)) {
        var data = bmp.LockBits(new Rectangle(0, 0, bm.bmWidth, bm.bmHeight), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        byte[] buf = new byte[bm.bmWidthBytes * bm.bmHeight];
        Marshal.Copy(bm.bmBits, buf, 0, buf.Length);
        // DIB vem de baixo para cima e com alfa pre-multiplicado
        for (int y = 0; y < bm.bmHeight; y++) {
          int src = (bm.bmHeight - 1 - y) * bm.bmWidthBytes;
          for (int x = 0; x < bm.bmWidth; x++) {
            int i = src + x * 4; byte a = buf[i + 3];
            if (a > 0 && a < 255) { buf[i] = (byte)Math.Min(255, buf[i] * 255 / a); buf[i+1] = (byte)Math.Min(255, buf[i+1] * 255 / a); buf[i+2] = (byte)Math.Min(255, buf[i+2] * 255 / a); }
          }
          Marshal.Copy(buf, src, data.Scan0 + y * data.Stride, bm.bmWidth * 4);
        }
        bmp.UnlockBits(data);
        bmp.Save(outPath, ImageFormat.Png);
      }
    } finally { DeleteObject(hbm); }
  }
}
"@
[ShellIcon]::Save("shell:AppsFolder\$Aumid", $Out, $Size)
