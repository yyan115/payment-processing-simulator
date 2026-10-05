package dev.yycodes.paymentsimulator.provider.visa;

import java.nio.charset.StandardCharsets;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.spec.MGF1ParameterSpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;
import javax.crypto.spec.SecretKeySpec;
import tools.jackson.databind.json.JsonMapper;

/**
 * Visa Message Level Encryption, which is a JWE with RSA-OAEP-256 key wrapping and A128GCM content
 * encryption. Requests are encrypted to Visa's server key, and responses arrive encrypted to ours.
 */
final class VisaMessageEncryption {
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();
    private static final OAEPParameterSpec OAEP =
            new OAEPParameterSpec(
                    "SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT);

    private final PublicKey visaKey;
    private final PrivateKey ourKey;
    private final String keyId;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final SecureRandom random = new SecureRandom();

    VisaMessageEncryption(PublicKey visaKey, PrivateKey ourKey, String keyId) {
        this.visaKey = visaKey;
        this.ourKey = ourKey;
        this.keyId = keyId;
    }

    String encrypt(String json) throws Exception {
        Map<String, Object> headerFields = new LinkedHashMap<>();
        headerFields.put("alg", "RSA-OAEP-256");
        headerFields.put("enc", "A128GCM");
        headerFields.put("kid", keyId);
        headerFields.put("iat", System.currentTimeMillis());
        String header =
                ENCODER.encodeToString(
                        JSON.writeValueAsString(headerFields).getBytes(StandardCharsets.UTF_8));
        byte[] contentKey = new byte[16];
        byte[] iv = new byte[12];
        random.nextBytes(contentKey);
        random.nextBytes(iv);

        Cipher content = Cipher.getInstance("AES/GCM/NoPadding");
        content.init(
                Cipher.ENCRYPT_MODE,
                new SecretKeySpec(contentKey, "AES"),
                new GCMParameterSpec(128, iv));
        content.updateAAD(header.getBytes(StandardCharsets.US_ASCII));
        byte[] sealed = content.doFinal(json.getBytes(StandardCharsets.UTF_8));
        byte[] cipherText = Arrays.copyOfRange(sealed, 0, sealed.length - 16);
        byte[] tag = Arrays.copyOfRange(sealed, sealed.length - 16, sealed.length);

        Cipher wrap = Cipher.getInstance("RSA/ECB/OAEPPadding");
        wrap.init(Cipher.ENCRYPT_MODE, visaKey, OAEP);
        byte[] wrapped = wrap.doFinal(contentKey);

        return String.join(
                ".",
                header,
                ENCODER.encodeToString(wrapped),
                ENCODER.encodeToString(iv),
                ENCODER.encodeToString(cipherText),
                ENCODER.encodeToString(tag));
    }

    String decrypt(String compact) throws Exception {
        String[] parts = compact.split("\\.");
        if (parts.length != 5) throw new IllegalArgumentException("Not a JWE compact string");
        Cipher unwrap = Cipher.getInstance("RSA/ECB/OAEPPadding");
        unwrap.init(Cipher.DECRYPT_MODE, ourKey, OAEP);
        byte[] contentKey = unwrap.doFinal(DECODER.decode(parts[1]));

        byte[] cipherText = DECODER.decode(parts[3]);
        byte[] tag = DECODER.decode(parts[4]);
        byte[] sealed = new byte[cipherText.length + tag.length];
        System.arraycopy(cipherText, 0, sealed, 0, cipherText.length);
        System.arraycopy(tag, 0, sealed, cipherText.length, tag.length);

        Cipher content = Cipher.getInstance("AES/GCM/NoPadding");
        content.init(
                Cipher.DECRYPT_MODE,
                new SecretKeySpec(contentKey, "AES"),
                new GCMParameterSpec(128, DECODER.decode(parts[2])));
        content.updateAAD(parts[0].getBytes(StandardCharsets.US_ASCII));
        return new String(content.doFinal(sealed), StandardCharsets.UTF_8);
    }
}
