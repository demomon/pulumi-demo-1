import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { k8sProvider, k8sConfig } from "./gke-cluster";
import * as ldap from "./ldap";


// const s3folder = require("./s3folder.js");

// // Create an instance of the S3Folder component
// let folder = new s3folder.S3Folder("pulumi-static-site", "./www");

// // Export `folder` output properties as stack outputs
// exports.bucketName = folder.bucketName;
// exports.websiteUrl = folder.websiteUrl;

// // Minikube does not implement services of type `LoadBalancer`; require the user to specify if we're
// // running on minikube, and if so, create only services of type ClusterIP.
// let config = new pulumi.Config();
// if (config.require("isMinikube") === "true") {
//     throw new Error("This example does not yet support minikube");
// }

// CREATE GKE CLUSTER

// Create a canary deployment to test that this cluster works.
const name = `${pulumi.getProject()}-${pulumi.getStack()}`;
const canaryLabels = { app: `canary-${name}` };
const canary = new k8s.apps.v1beta1.Deployment("canary", {
    spec: {
        selector: { matchLabels: canaryLabels },
        replicas: 1,
        template: {
            metadata: { labels: canaryLabels },
            spec: { containers: [{ name, image: "nginx" }] },
        },
    },
}, { provider: k8sProvider });

// Export the Kubeconfig so that clients can easily access our cluster.
export let kubeConfig = k8sConfig;

// INSTALL HELM SERVICES

// Deploy the latest version of the stable/wordpress chart.
const jenkins = new k8s.helm.v2.Chart("jenkins", {
    repo: "stable",
    version: "0.25.1",
    chart: "jenkins",
    }, { 
        providers: { kubernetes: k8sProvider }
    }
);

const artifactory = new k8s.helm.v2.Chart(
    "artifactory", {
        repo: "jfrog",
        version: "7.7.12",
        chart: "artifactory",
    }, { 
        providers: { kubernetes: k8sProvider }
    }
);

// INSTALL LDAP

let ldapServer = new ldap.LdapInstallation( {
    name: "ldap",
    imageName: "caladreas/opendj",
    imageTag: "2.6.4-b6",
});