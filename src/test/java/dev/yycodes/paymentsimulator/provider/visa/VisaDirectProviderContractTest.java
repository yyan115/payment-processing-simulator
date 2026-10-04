package dev.yycodes.paymentsimulator.provider.visa;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import dev.yycodes.paymentsimulator.provider.*;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class VisaDirectProviderContractTest {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private HttpServer server;
    private VisaMessageEncryption encryption;
    private VisaDirectProvider provider;
    private final AtomicReference<String> lastPath = new AtomicReference<>();
    private final AtomicReference<String> lastAuthorization = new AtomicReference<>();
    private final AtomicReference<String> lastKeyId = new AtomicReference<>();
    private final AtomicReference<String> lastBody = new AtomicReference<>();
    private final AtomicInteger status = new AtomicInteger(200);
    private final AtomicReference<String> reply = new AtomicReference<>("{}");
    private final AtomicInteger calls = new AtomicInteger();

    @BeforeEach
    void start() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        var pair = generator.generateKeyPair();
        // One key pair plays both Visa's and ours, so the test server can read and answer.
        encryption = new VisaMessageEncryption(pair.getPublic(), pair.getPrivate(), "key-1");
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/",
                exchange -> {
                    calls.incrementAndGet();
                    lastPath.set(exchange.getRequestURI().toString());
                    lastAuthorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
                    lastKeyId.set(exchange.getRequestHeaders().getFirst("keyId"));
                    lastBody.set(
                            new String(
                                    exchange.getRequestBody().readAllBytes(),
                                    StandardCharsets.UTF_8));
                    byte[] out = reply.get().getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    exchange.sendResponseHeaders(status.get(), out.length);
                    exchange.getResponseBody().write(out);
                    exchange.close();
                });
        server.start();
        provider =
                new VisaDirectProvider(
                        new VisaDirectPayloadFactory(
                                mapper, "408999", "4957030420210454", "4653459515756154", "MD"),
                        new VisaDirectResponseParser(mapper),
                        mapper,
                        URI.create("http://127.0.0.1:" + server.getAddress().getPort()),
                        "user",
                        "secret",
                        "key-1",
                        encryption,
                        HttpClient.newHttpClient(),
                        Clock.fixed(Instant.parse("2026-10-02T10:00:00Z"), ZoneOffset.UTC));
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private void replyEncrypted(String json) throws Exception {
        reply.set("{\"encData\":\"" + encryption.encrypt(json) + "\"}");
    }

    @Test
    void anApprovalIsSucceededAndTheRequestIsEncryptedAndAuthenticated() throws Exception {
        replyEncrypted(
                "{\"transactionIdentifier\":123,\"actionCode\":\"00\",\"approvalCode\":\"A1\"}");
        UUID reference = UUID.randomUUID();

        var result =
                provider.submit(reference, new BigDecimal("53.00"), "USD", SubmissionMode.ORIGINAL);

        assertThat(result.status()).isEqualTo(ProviderStatus.SUCCEEDED);
        assertThat(result.providerReference()).isEqualTo("123");
        assertThat(lastPath.get()).isEqualTo("/visadirect/fundstransfer/v1/pushfundstransactions");
        assertThat(lastAuthorization.get()).startsWith("Basic ");
        assertThat(lastKeyId.get()).isEqualTo("key-1");
        // The body on the wire is only the encrypted envelope.
        JsonNode envelope = mapper.readTree(lastBody.get());
        assertThat(envelope.size()).isEqualTo(1);
        assertThat(lastBody.get()).doesNotContain("recipientPrimaryAccountNumber");
        JsonNode sent = mapper.readTree(encryption.decrypt(envelope.path("encData").asText()));
        assertThat(sent.path("amount").asText()).isEqualTo("53.00");
        assertThat(sent.path("transactionIdentifier").asText())
                .isEqualTo(VisaDirectPayloadFactory.transactionIdentifier(reference));
    }

    @Test
    void aResendCarriesTheSameIdentifiers() throws Exception {
        replyEncrypted("{\"transactionIdentifier\":1,\"actionCode\":\"00\"}");
        UUID reference = UUID.randomUUID();
        provider.submit(reference, new BigDecimal("10.00"), "USD", SubmissionMode.ORIGINAL);
        JsonNode first =
                mapper.readTree(
                        encryption.decrypt(
                                mapper.readTree(lastBody.get()).path("encData").asText()));
        provider.submit(reference, new BigDecimal("10.00"), "USD", SubmissionMode.RETRY);
        JsonNode second =
                mapper.readTree(
                        encryption.decrypt(
                                mapper.readTree(lastBody.get()).path("encData").asText()));
        for (String field :
                new String[] {
                    "transactionIdentifier", "retrievalReferenceNumber", "systemsTraceAuditNumber"
                }) assertThat(second.path(field).asText()).isEqualTo(first.path(field).asText());
    }

    @Test
    void aDeclineIsDeclined() throws Exception {
        replyEncrypted("{\"actionCode\":\"05\"}");
        var result =
                provider.submit(
                        UUID.randomUUID(), new BigDecimal("1.00"), "USD", SubmissionMode.ORIGINAL);
        assertThat(result.status()).isEqualTo(ProviderStatus.DECLINED);
    }

    @Test
    void aPlainUnencryptedReplyIsAlsoRead() throws Exception {
        reply.set("{\"transactionIdentifier\":7,\"actionCode\":\"00\"}");
        var result =
                provider.submit(
                        UUID.randomUUID(), new BigDecimal("1.00"), "USD", SubmissionMode.ORIGINAL);
        assertThat(result.status()).isEqualTo(ProviderStatus.SUCCEEDED);
    }

    @Test
    void aRejectedRequestSaysWhy() throws Exception {
        status.set(400);
        replyEncrypted("{\"errorMessage\":\"Message has failed validation: amount\"}");
        assertThatThrownBy(
                        () ->
                                provider.submit(
                                        UUID.randomUUID(),
                                        new BigDecimal("1.00"),
                                        "USD",
                                        SubmissionMode.ORIGINAL))
                .isInstanceOf(ProviderRejectedException.class)
                .hasMessageContaining("HTTP 400")
                .hasMessageContaining("failed validation");
    }

    @Test
    void aServerErrorIsAnAmbiguousResult() {
        status.set(503);
        assertThatThrownBy(
                        () ->
                                provider.submit(
                                        UUID.randomUUID(),
                                        new BigDecimal("1.00"),
                                        "USD",
                                        SubmissionMode.ORIGINAL))
                .isInstanceOf(ProviderTimeoutException.class);
    }

    @Test
    void anUnreadableReplyIsAnAmbiguousResult() {
        reply.set("not json");
        assertThatThrownBy(
                        () ->
                                provider.submit(
                                        UUID.randomUUID(),
                                        new BigDecimal("1.00"),
                                        "USD",
                                        SubmissionMode.ORIGINAL))
                .isInstanceOf(ProviderTimeoutException.class);
    }

    @Test
    void lookupAsksForTheDerivedTransactionIdentifier() {
        UUID reference = UUID.randomUUID();
        String identifier = VisaDirectPayloadFactory.transactionIdentifier(reference);
        reply.set(
                "[{\"transactionIdentifier\":\""
                        + identifier
                        + "\",\"actionCode\":\"00\",\"statusCode\":\"COMPLETED\"}]");

        var result = provider.findByClientReference(reference);

        assertThat(result).isPresent();
        assertThat(result.get().status()).isEqualTo(ProviderStatus.SUCCEEDED);
        assertThat(lastPath.get())
                .isEqualTo(
                        "/visadirect/v1/transactionquery?acquiringBIN=408999&transactionIdentifier="
                                + identifier);
    }

    @Test
    void lookupWithNoRecordIsEmpty() {
        reply.set(
                "{\"errorMessage\":\"No transactions found for the specified input parameters\"}");
        assertThat(provider.findByClientReference(UUID.randomUUID())).isEmpty();
    }

    @Test
    void onlyTheVisaSandboxHostIsAllowed() {
        VisaDirectProvider.requireSandboxBaseUrl(URI.create("https://sandbox.api.visa.com"));
        assertThatThrownBy(
                        () ->
                                VisaDirectProvider.requireSandboxBaseUrl(
                                        URI.create("https://api.visa.com")))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(
                        () ->
                                VisaDirectProvider.requireSandboxBaseUrl(
                                        URI.create("http://sandbox.api.visa.com")))
                .isInstanceOf(IllegalStateException.class);
        assertThat(calls.get()).isZero();
    }
}
