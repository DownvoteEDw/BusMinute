"use client";

import { Component, type ReactNode } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import type { Locale } from "../src/application/i18n";
import { TransitError } from "./transit-error";

interface BoundaryProps
{
    children: ReactNode;
    locale: Locale;
    retry: () => void;
}

class Boundary extends Component<BoundaryProps, { failed: boolean }>
{
    public override state = { failed: false };

    public static getDerivedStateFromError(error: unknown): { failed: boolean }
    {
        unstable_rethrow(error);
        return { failed: true };
    }

    public override componentDidUpdate(previous: BoundaryProps): void
    {
        if (this.state.failed && previous.children !== this.props.children)
        {
            this.setState({ failed: false });
        }
    }

    public override render(): ReactNode
    {
        if (this.state.failed)
        {
            return <TransitError locale={this.props.locale} retry={this.props.retry} />;
        }
        return this.props.children;
    }
}

export function TransitBoundary({ children, locale }: { children: ReactNode; locale: Locale })
{
    const router = useRouter();
    return <Boundary locale={locale} retry={() => router.refresh()}>{children}</Boundary>;
}
