$csharp = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public class TelepointIconGen
{
    public static void Generate(string path, int width, int height, bool isSplash)
    {
        using (Bitmap bmp = new Bitmap(width, height))
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

            int tileW, tileH, tileX, tileY;
            if (isSplash)
            {
                using (SolidBrush bg = new SolidBrush(ColorTranslator.FromHtml("#080B11")))
                {
                    g.FillRectangle(bg, 0, 0, width, height);
                }
                tileW = 320;
                tileH = 320;
                tileX = (width - tileW) / 2;
                tileY = (height - tileH) / 2 - 120;
            }
            else
            {
                using (SolidBrush bg = new SolidBrush(ColorTranslator.FromHtml("#080B11")))
                {
                    g.FillRectangle(bg, 0, 0, width, height);
                }
                tileW = (int)(width * 0.88);
                tileH = (int)(height * 0.88);
                tileX = (width - tileW) / 2;
                tileY = (height - tileH) / 2;
            }

            // Navy Rounded Tile
            Rectangle tileRect = new Rectangle(tileX, tileY, tileW, tileH);
            using (LinearGradientBrush navyBrush = new LinearGradientBrush(
                tileRect,
                ColorTranslator.FromHtml("#1b3e7d"),
                ColorTranslator.FromHtml("#0a1f44"),
                LinearGradientMode.ForwardDiagonal))
            using (GraphicsPath path2 = new GraphicsPath())
            {
                int r = (int)(tileW * 0.22);
                int d = r * 2;
                path2.AddArc(tileX, tileY, d, d, 180, 90);
                path2.AddArc(tileX + tileW - d, tileY, d, d, 270, 90);
                path2.AddArc(tileX + tileW - d, tileY + tileH - d, d, d, 0, 90);
                path2.AddArc(tileX, tileY + tileH - d, d, d, 90, 90);
                path2.CloseFigure();
                g.FillPath(navyBrush, path2);
            }

            // Orbit Swoosh
            float cx = tileX + tileW / 2f;
            float cy = tileY + tileH * 0.48f;
            g.TranslateTransform(cx, cy);
            g.RotateTransform(-28f);

            int orbitPenWidth = Math.Max(2, (int)(tileW * 0.038));
            using (Pen orbitPen = new Pen(ColorTranslator.FromHtml("#38bdf8"), orbitPenWidth))
            {
                int orbitW = (int)(tileW * 0.82);
                int orbitH = (int)(tileH * 0.35);
                g.DrawEllipse(orbitPen, -orbitW / 2, -orbitH / 2, orbitW, orbitH);
            }
            g.ResetTransform();

            // Satellite Dot
            using (SolidBrush dotBrush = new SolidBrush(ColorTranslator.FromHtml("#8ad4ff")))
            {
                int dotR = (int)(tileW * 0.042);
                int dotX = tileX + (int)(tileW * 0.77);
                int dotY = tileY + (int)(tileH * 0.23);
                g.FillEllipse(dotBrush, dotX, dotY, dotR * 2, dotR * 2);
            }

            // White "T" Top Bar
            using (SolidBrush whiteBrush = new SolidBrush(Color.White))
            {
                int tBarW = (int)(tileW * 0.54);
                int tBarH = (int)(tileH * 0.145);
                int tBarX = tileX + (tileW - tBarW) / 2;
                int tBarY = tileY + (int)(tileH * 0.24);
                g.FillRectangle(whiteBrush, tBarX, tBarY, tBarW, tBarH);

                // White "T" Stem
                int tStemW = (int)(tileW * 0.155);
                int tStemH = (int)(tileH * 0.44);
                int tStemX = tileX + (tileW - tStemW) / 2;
                int tStemY = tBarY + (int)(tBarH * 0.7);
                g.FillRectangle(whiteBrush, tStemX, tStemY, tStemW, tStemH);

                // Electric Blue 3D Facet
                using (SolidBrush facetBrush = new SolidBrush(ColorTranslator.FromHtml("#2563eb")))
                {
                    int facetW = (int)(tStemW * 0.5);
                    int facetX = tStemX + facetW;
                    g.FillRectangle(facetBrush, facetX, tStemY + (int)(tStemH * 0.08), facetW, (int)(tStemH * 0.92));
                }
            }

            // Splash Text
            if (isSplash)
            {
                using (Font font = new Font("Arial", 42, FontStyle.Bold))
                using (SolidBrush textBrush = new SolidBrush(Color.White))
                using (StringFormat sf = new StringFormat { Alignment = StringAlignment.Center })
                {
                    g.DrawString("TELEPOINT", font, textBrush, width / 2f, tileY + tileH + 50, sf);
                }

                using (Font subFont = new Font("Arial", 18, FontStyle.Regular))
                using (SolidBrush subBrush = new SolidBrush(ColorTranslator.FromHtml("#94A3B8")))
                using (StringFormat sf = new StringFormat { Alignment = StringAlignment.Center })
                {
                    g.DrawString("BANK-GRADE SECURE EMI PLATFORM", subFont, subBrush, width / 2f, tileY + tileH + 120, sf);
                }
            }

            bmp.Save(path, ImageFormat.Png);
            Console.WriteLine("Successfully created: " + path);
        }
    }
}
"@

Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Drawing

[TelepointIconGen]::Generate("d:\telepoint\mobile\assets\icon.png", 1024, 1024, $false)
[TelepointIconGen]::Generate("d:\telepoint\mobile\assets\adaptive-icon.png", 1024, 1024, $false)
[TelepointIconGen]::Generate("d:\telepoint\mobile\assets\splash.png", 1242, 2436, $true)
