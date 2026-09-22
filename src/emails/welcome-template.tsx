import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Html,
    Img,
    Preview,
    Section,
    Text,
} from '@react-email/components';
import type { CSSProperties } from 'react';

type WelcomeTemplateProps = {
    verificationUrl: string;
};

const pageStyle: CSSProperties = {
    backgroundColor: '#f3f4f6',
    fontFamily: 'Arial, Helvetica, sans-serif',
    margin: 0,
    padding: '32px 16px',
};

const containerStyle: CSSProperties = {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    margin: '0 auto',
    maxWidth: '560px',
    padding: '40px 32px',
};

const buttonStyle: CSSProperties = {
    backgroundColor: '#198754',
    borderRadius: '6px',
    color: '#ffffff',
    display: 'inline-block',
    fontSize: '16px',
    fontWeight: 700,
    padding: '14px 24px',
    textDecoration: 'none',
};

export function WelcomeTemplate({ verificationUrl }: WelcomeTemplateProps) {
    return (
        <Html>
            <Head />
            <Preview>Welcome to Arkana. Verify your email to get started.</Preview>
            <Body style={pageStyle}>
                <Container style={containerStyle}>
                    <Section style={{ textAlign: 'center' }}>
                        <Img
                            src="https://arkcards.com"
                            alt="Arkana"
                            width="60"
                            style={{ display: 'block', height: '60px', margin: '0 auto' }}
                        />
                    </Section>

                    <Heading
                        as="h1"
                        style={{
                            color: '#114e60',
                            fontSize: '28px',
                            fontWeight: 700,
                            lineHeight: '36px',
                            margin: '28px 0 12px',
                            textAlign: 'center',
                        }}
                    >
                        Welcome to Arkana
                    </Heading>
                    <Text
                        style={{
                            color: '#475569',
                            fontSize: '16px',
                            lineHeight: '24px',
                            margin: '0 auto 28px',
                            maxWidth: '440px',
                            textAlign: 'center',
                        }}
                    >
                        Thanks for joining Arkana, the zero-commission marketplace for tarot and oracle card enthusiasts.
                    </Text>

                    <Section style={{ textAlign: 'center' }}>
                        <Button href={verificationUrl} style={buttonStyle}>
                            Verify your email
                        </Button>
                    </Section>

                    <Text
                        style={{
                            color: '#64748b',
                            fontSize: '14px',
                            lineHeight: '21px',
                            margin: '28px 0 0',
                            textAlign: 'center',
                        }}
                    >
                        If you did not create an Arkana account, you can safely ignore this email.
                    </Text>

                    <Section
                        style={{
                            borderTop: '1px solid #e5e7eb',
                            marginTop: '32px',
                            paddingTop: '20px',
                            textAlign: 'center',
                        }}
                    >
                        <Text style={{ color: '#94a3b8', fontSize: '12px', lineHeight: '18px', margin: 0 }}>
                            Arkana · arkcards.com
                        </Text>
                        <Text style={{ color: '#94a3b8', fontSize: '12px', lineHeight: '18px', margin: '4px 0 0' }}>
                            A thoughtful home for tarot and oracle card collectors.
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

export default WelcomeTemplate;
