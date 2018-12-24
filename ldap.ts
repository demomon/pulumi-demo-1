import * as k8s from "@pulumi/kubernetes";
import * as k8stypes from "@pulumi/kubernetes/types/input";
import * as pulumi from "@pulumi/pulumi";
import * as cluster from "./gke-cluster"


export interface LdapArgs {
    readonly name: string,
    readonly imageName: string,
    readonly imageTag: string
}

// docker.io

export class LdapInstallation extends pulumi.ComponentResource {
    public readonly deployment: k8s.apps.v1.Deployment;
    public readonly service: k8s.core.v1.Service;

    constructor(args: LdapArgs) {
        super("k8stypes:service:LdapInstallation", args.name, {});
        const labels = { app: args.name };
        const name = args.name

        const container: k8stypes.core.v1.Container = {
            name,
            image: args.imageName + ":" + args.imageTag,
            resources: { 
                requests: { cpu: "100m", memory: "200Mi" },
                limits: { cpu: "100m", memory: "200Mi" },
            },
            ports: [{
                    name: "ldap",containerPort: 1389,
                },
            ]
        };

        this.deployment = new k8s.apps.v1.Deployment(args.name, {
            spec: {
                selector: { matchLabels: labels },
                replicas: 1,
                template: {
                    metadata: { labels: labels },
                    spec: { containers: [ container ] },
                },
            },
        },{ provider: cluster.k8sProvider });

        this.service = new k8s.core.v1.Service(args.name, {
            metadata: {
                labels: this.deployment.metadata.apply(meta => meta.labels),
            },
            spec: {
                ports: [{
                        name: "ldap", port: 389, targetPort: "ldap" , protocol: "TCP"
                    },
                ],
                selector: this.deployment.spec.apply(spec => spec.template.metadata.labels),
                type: "ClusterIP",
            },
        }, { provider: cluster.k8sProvider });
    }
}

