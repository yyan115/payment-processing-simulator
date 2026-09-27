package dev.yycodes.paymentsimulator.provider.mastercard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mockStatic;

import com.mastercard.developer.utils.AuthenticationUtils;

import dev.yycodes.paymentsimulator.provider.PaymentProvider;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import tools.jackson.databind.json.JsonMapper;

import java.security.KeyPairGenerator;

class MastercardProviderContextTest {
    @Test
    void mastercardModeStartsWithItsConfiguredSigningCredentials() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        var privateKey = generator.generateKeyPair().getPrivate();

        try (var authentication = mockStatic(AuthenticationUtils.class)) {
            authentication
                    .when(
                            () ->
                                    AuthenticationUtils.loadSigningKey(
                                            "test.p12", "test-alias", "test-password"))
                    .thenReturn(privateKey);

            new ApplicationContextRunner()
                    .withUserConfiguration(
                            MastercardSendDisbursementsProvider.class,
                            MastercardSendRequestFactory.class,
                            MastercardSendResponseParser.class)
                    .withBean(JsonMapper.class, () -> JsonMapper.builder().build())
                    .withPropertyValues(
                            "payments.provider=mastercard",
                            "payments.mastercard.base-url=https://sandbox.api.move.mastercard.com",
                            "payments.mastercard.partner-id=test-partner",
                            "payments.mastercard.consumer-key=test-consumer",
                            "payments.mastercard.p12-path=test.p12",
                            "payments.mastercard.key-alias=test-alias",
                            "payments.mastercard.key-password=test-password",
                            "payments.mastercard.recipient-account-uri=raw:test-recipient")
                    .run(
                            context -> {
                                assertThat(context).hasNotFailed();
                                assertThat(context).hasSingleBean(PaymentProvider.class);
                                assertThat(context.getBean(PaymentProvider.class))
                                        .isInstanceOf(MastercardSendDisbursementsProvider.class);
                            });

            authentication.verify(
                    () ->
                            AuthenticationUtils.loadSigningKey(
                                    "test.p12", "test-alias", "test-password"));
        }
    }
}
