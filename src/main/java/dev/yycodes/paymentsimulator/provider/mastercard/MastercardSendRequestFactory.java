package dev.yycodes.paymentsimulator.provider.mastercard;

import dev.yycodes.paymentsimulator.shared.MoneyAmounts;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Component
@ConditionalOnProperty(name = "payments.provider", havingValue = "mastercard")
public class MastercardSendRequestFactory {

    private static final DateTimeFormatter LOCAL_DATE_TIME_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssxxx");

    private final JsonMapper mapper;
    private final String senderAccountUri;
    private final String recipientAccountUri;
    private final String paymentType;
    private final String fundingSource;
    private final String paymentOriginationCountry;
    private final Clock transactionClock;

    @Autowired
    public MastercardSendRequestFactory(
            JsonMapper mapper,
            @Value("${payments.mastercard.sender-account-uri:}")
            String senderAccountUri,
            @Value("${payments.mastercard.recipient-account-uri}")
            String recipientAccountUri,
            @Value("${payments.mastercard.payment-type:BDB}")
            String paymentType,
            @Value("${payments.mastercard.funding-source:}")
            String fundingSource,
            @Value("${payments.mastercard.payment-origination-country:}")
            String paymentOriginationCountry,
            @Value("${payments.mastercard.transaction-time-zone:}")
            String transactionTimeZone) {
        this(
                mapper,
                senderAccountUri,
                recipientAccountUri,
                paymentType,
                fundingSource,
                paymentOriginationCountry,
                transactionTimeZone == null || transactionTimeZone.isBlank()
                        ? null
                        : Clock.system(ZoneId.of(transactionTimeZone))
        );

        requireConfigured(
                "payments.mastercard.recipient-account-uri",
                recipientAccountUri
        );
    }

    MastercardSendRequestFactory(
            JsonMapper mapper,
            String senderAccountUri,
            String recipientAccountUri,
            String paymentType,
            String fundingSource,
            String paymentOriginationCountry,
            Clock transactionClock) {
        this.mapper = mapper;
        this.senderAccountUri = normalizeOptional(senderAccountUri);
        this.recipientAccountUri = recipientAccountUri;
        this.paymentType = normalizeOptional(paymentType);
        this.fundingSource = normalizeOptional(fundingSource);
        this.paymentOriginationCountry =
                normalizeOptional(paymentOriginationCountry);
        this.transactionClock = transactionClock;
    }

    public String createPayload(
            UUID clientReference,
            BigDecimal amount,
            String currency) {

        ObjectNode payment = mapper.createObjectNode();
        payment.put("disbursement_reference", clientReference.toString());
        payment.put(
                "amount",
                MoneyAmounts.toMinorUnits(amount, currency)
        );
        payment.put("currency", currency);
        payment.put("recipient_account_uri", recipientAccountUri);

        putIfConfigured(payment, "payment_type", paymentType);
        putIfConfigured(payment, "sender_account_uri", senderAccountUri);
        putIfConfigured(payment, "funding_source", fundingSource);
        putIfConfigured(
                payment,
                "payment_origination_country",
                paymentOriginationCountry
        );

        if (transactionClock != null) {
            payment.put(
                    "transaction_local_date_time",
                    OffsetDateTime.now(transactionClock)
                            .withNano(0)
                            .format(LOCAL_DATE_TIME_FORMAT)
            );
        }

        ObjectNode wrapper = mapper.createObjectNode();
        wrapper.set("payment_disbursement", payment);
        return mapper.writeValueAsString(wrapper);
    }

    private static void putIfConfigured(
            ObjectNode node,
            String field,
            String value) {
        if (value != null) {
            node.put(field, value);
        }
    }

    private static String normalizeOptional(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private static void requireConfigured(String property, String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    property
                            + " must be configured when PAYMENTS_PROVIDER=mastercard");
        }
    }
}
