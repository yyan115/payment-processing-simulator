package dev.yycodes.paymentsimulator.provider.mastercard;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Component
public class MastercardSendRequestFactory {

    private static final DateTimeFormatter LOCAL_DATE_TIME_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssxxx");

    private final JsonMapper mapper;
    private final String senderAccountUri;
    private final String recipientAccountUri;
    private final Clock clock;

    public MastercardSendRequestFactory(
            JsonMapper mapper,
            @Value("${payments.mastercard.sender-account-uri}") String senderAccountUri,
            @Value("${payments.mastercard.recipient-account-uri}") String recipientAccountUri) {
        this(mapper, senderAccountUri, recipientAccountUri, Clock.systemUTC());
    }

    MastercardSendRequestFactory(
            JsonMapper mapper,
            String senderAccountUri,
            String recipientAccountUri,
            Clock clock) {
        this.mapper = mapper;
        this.senderAccountUri = senderAccountUri;
        this.recipientAccountUri = recipientAccountUri;
        this.clock = clock;
    }

    public String createPayload(
            UUID clientReference,
            BigDecimal amount,
            String currency) {

        ObjectNode payment = mapper.createObjectNode();
        payment.put("disbursement_reference", clientReference.toString());
        payment.put("amount", amount.toPlainString());
        payment.put("currency", currency);
        payment.put("payment_type", "BDB");
        payment.put("sender_account_uri", senderAccountUri);
        payment.put("recipient_account_uri", recipientAccountUri);
        payment.put("funding_source", "DEPOSIT_ACCOUNT");
        payment.put("payment_origination_country", "USA");
        payment.put(
                "transaction_local_date_time",
                OffsetDateTime.now(clock)
                        .withNano(0)
                        .format(LOCAL_DATE_TIME_FORMAT)
        );

        ObjectNode sender = payment.putObject("sender");
        sender.put("first_name", "Sandbox");
        sender.put("last_name", "Business");
        ObjectNode senderAddress = sender.putObject("address");
        senderAddress.put("line1", "123 Corporate Drive");
        senderAddress.put("city", "Chicago");
        senderAddress.put("country_subdivision", "IL");
        senderAddress.put("postal_code", "60618");
        senderAddress.put("country", "USA");

        ObjectNode recipient = payment.putObject("recipient");
        recipient.put("first_name", "Sandbox");
        recipient.put("last_name", "Recipient");
        ObjectNode recipientAddress = recipient.putObject("address");
        recipientAddress.put("line1", "1 Main St");
        recipientAddress.put("city", "OFallon");
        recipientAddress.put("country_subdivision", "MO");
        recipientAddress.put("postal_code", "63368");
        recipientAddress.put("country", "USA");

        ObjectNode participant = payment.putObject("participant");
        participant.put("merchant_category_code", "4121");
        participant.put("card_acceptor_id", "PaymentSimulator");
        participant.put("customer_service_contact_info", "18005559999");

        ObjectNode wrapper = mapper.createObjectNode();
        wrapper.set("payment_disbursement", payment);

        return mapper.writeValueAsString(wrapper);
    }
}
