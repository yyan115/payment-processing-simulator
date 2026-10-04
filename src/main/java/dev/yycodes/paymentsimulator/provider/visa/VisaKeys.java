package dev.yycodes.paymentsimulator.provider.visa;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;

/** Reads the PEM files Visa issues and builds the two-way SSL context from them. */
final class VisaKeys {
    private VisaKeys() {}

    /** Decodes a base64 property that holds a PEM file. */
    static String pem(String base64) {
        if (base64 == null || base64.isBlank()) return "";
        return new String(Base64.getMimeDecoder().decode(base64.trim()), StandardCharsets.UTF_8);
    }

    // The files Visa serves can arrive without line breaks, so the body is cut out by hand.
    private static byte[] body(String pem) {
        String text =
                pem.replaceAll("-----BEGIN [A-Z ]+-----", "")
                        .replaceAll("-----END [A-Z ]+-----", "")
                        .replaceAll("\\s+", "");
        return Base64.getDecoder().decode(text);
    }

    static X509Certificate certificate(String pem) throws Exception {
        return (X509Certificate)
                CertificateFactory.getInstance("X.509")
                        .generateCertificate(new ByteArrayInputStream(body(pem)));
    }

    static PrivateKey privateKey(String pem) throws Exception {
        byte[] der = body(pem);
        // Visa issues PKCS#1 ("BEGIN RSA PRIVATE KEY"), which the JDK reads only as PKCS#8.
        if (pem.contains("BEGIN RSA PRIVATE KEY")) der = pkcs1ToPkcs8(der);
        return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der));
    }

    static SSLContext twoWaySsl(PrivateKey key, Certificate certificate) throws Exception {
        KeyStore store = KeyStore.getInstance("PKCS12");
        store.load(null, null);
        store.setKeyEntry("visa", key, new char[0], new Certificate[] {certificate});
        KeyManagerFactory keys =
                KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keys.init(store, new char[0]);
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(keys.getKeyManagers(), null, null);
        return context;
    }

    static byte[] pkcs1ToPkcs8(byte[] pkcs1) {
        byte[] version = {0x02, 0x01, 0x00};
        byte[] rsaEncryption = {
            0x30,
            0x0d,
            0x06,
            0x09,
            0x2a,
            (byte) 0x86,
            0x48,
            (byte) 0x86,
            (byte) 0xf7,
            0x0d,
            0x01,
            0x01,
            0x01,
            0x05,
            0x00
        };
        byte[] octets = der(0x04, pkcs1);
        ByteArrayOutputStream inner = new ByteArrayOutputStream();
        inner.writeBytes(version);
        inner.writeBytes(rsaEncryption);
        inner.writeBytes(octets);
        return der(0x30, inner.toByteArray());
    }

    private static byte[] der(int tag, byte[] content) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(tag);
        int length = content.length;
        if (length < 0x80) {
            out.write(length);
        } else if (length < 0x100) {
            out.write(0x81);
            out.write(length);
        } else {
            out.write(0x82);
            out.write(length >> 8);
            out.write(length & 0xff);
        }
        out.writeBytes(content);
        return out.toByteArray();
    }
}
