package dev.yycodes.paymentsimulator.provider.visa;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Builds the Visa Direct push funds request. Visa matches a payment by its identifiers, so they are
 * derived from the payout reference. A resend then carries the same identifiers and Visa can
 * recognise it as the same payment.
 */
@Component
public class VisaDirectPayloadFactory {
    private static final DateTimeFormatter LOCAL_TIME =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss").withZone(ZoneOffset.UTC);

    private final JsonMapper mapper;
    private final String acquiringBin;
    private final String recipientPan;
    private final String senderAccountNumber;
    private final String businessApplicationId;

    public VisaDirectPayloadFactory(
            JsonMapper mapper,
            @Value("${payments.visa.acquiring-bin:408999}") String acquiringBin,
            @Value("${payments.visa.recipient-pan:4957030420210454}") String recipientPan,
            @Value("${payments.visa.sender-account-number:4653459515756154}")
                    String senderAccountNumber,
            @Value("${payments.visa.business-application-id:MD}") String businessApplicationId) {
        this.mapper = mapper;
        this.acquiringBin = acquiringBin;
        this.recipientPan = recipientPan;
        this.senderAccountNumber = senderAccountNumber;
        this.businessApplicationId = businessApplicationId;
    }

    public String acquiringBin() {
        return acquiringBin;
    }

    /** The 15 digit identifier Visa uses to find this payment again. */
    public static String transactionIdentifier(UUID reference) {
        return digits(reference, "transactionIdentifier", 15);
    }

    /**
     * The 12 digit retrieval reference number. Visa checks its shape, which is a year digit, then a
     * day of the year from 001 to 366, then eight more digits. Visa rejects any other value.
     */
    public static String retrievalReferenceNumber(UUID reference) {
        String raw = digits(reference, "retrievalReferenceNumber", 12);
        int dayOfYear = 1 + Integer.parseInt(raw.substring(1, 4)) % 366;
        return raw.charAt(0) + String.format("%03d", dayOfYear) + raw.substring(4);
    }

    public String createPayload(UUID reference, BigDecimal amount, String currency, Instant now) {
        ObjectNode root = mapper.createObjectNode();
        root.put("amount", amount.setScale(2, RoundingMode.UNNECESSARY).toPlainString());
        root.put("senderAddress", "901 Metro Center Blvd");
        root.put("localTransactionDateTime", LOCAL_TIME.format(now));
        ObjectNode pos = root.putObject("pointOfServiceData");
        pos.put("panEntryMode", "90");
        pos.put("posConditionCode", "00");
        pos.put("motoECIIndicator", "0");
        root.put("recipientPrimaryAccountNumber", recipientPan);
        root.put("senderName", "Payment Processing Simulator");
        root.put("senderCity", "Foster City");
        root.put("senderStateCode", "CA");
        root.put("senderCountryCode", "USA");
        ObjectNode acceptor = root.putObject("cardAcceptor");
        ObjectNode address = acceptor.putObject("address");
        address.put("country", "USA");
        address.put("county", "San Mateo");
        address.put("state", "CA");
        address.put("zipCode", "94404");
        acceptor.put("idCode", "CA-IDCode-77765");
        acceptor.put("name", "Visa Inc. USA-Foster City");
        acceptor.put("terminalId", "TID-9999");
        root.put("senderAccountNumber", senderAccountNumber);
        root.put("senderReference", "");
        root.put("transactionIdentifier", transactionIdentifier(reference));
        root.put("acquirerCountryCode", "840");
        root.put("acquiringBin", acquiringBin);
        root.put("retrievalReferenceNumber", retrievalReferenceNumber(reference));
        root.put("systemsTraceAuditNumber", digits(reference, "systemsTraceAuditNumber", 6));
        root.put("transactionCurrencyCode", currency);
        root.put("businessApplicationId", businessApplicationId);
        return mapper.writeValueAsString(root);
    }

    private static String digits(UUID reference, String field, int length) {
        try {
            byte[] hash =
                    MessageDigest.getInstance("SHA-256")
                            .digest((reference + ":" + field).getBytes(StandardCharsets.UTF_8));
            String number = new BigInteger(1, hash).toString();
            return number.substring(0, length);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }
}
