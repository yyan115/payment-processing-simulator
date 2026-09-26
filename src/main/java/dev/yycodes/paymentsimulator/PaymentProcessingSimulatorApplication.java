package dev.yycodes.paymentsimulator;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class PaymentProcessingSimulatorApplication {

    public static void main(String[] args) {
        SpringApplication.run(PaymentProcessingSimulatorApplication.class, args);
    }
}
